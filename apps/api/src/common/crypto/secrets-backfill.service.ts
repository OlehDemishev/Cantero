import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { currentKeyPrefix, decryptSecret, encryptSecret, isEncryptedWithCurrentKey } from "./secret-box";

/** Every stored secret column secret-box.ts protects, by Prisma model delegate. */
export const ENCRYPTED_COLUMNS: { model: string; fields: string[] }[] = [
  { model: "accountingConnection", fields: ["accessToken", "refreshToken"] },
  { model: "docusignConnection", fields: ["accessToken", "refreshToken"] },
  { model: "intacctConnection", fields: ["accessToken", "refreshToken"] },
  { model: "msProjectConnection", fields: ["accessToken", "refreshToken"] },
  { model: "autodeskConnection", fields: ["accessToken", "refreshToken", "viewerAccessToken"] },
  { model: "webhookEndpoint", fields: ["secret"] },
  { model: "user", fields: ["totpSecret", "pendingTotpSecret"] },
];

const BATCH = 200;

type Delegate = {
  findMany(args: unknown): Promise<Record<string, string | null>[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

/**
 * Brings every stored secret to the current DATA_ENCRYPTION_KEY, once per boot, in the
 * background: rows written before encryption existed (plaintext), and — after a key rotation —
 * rows still under DATA_ENCRYPTION_KEY_PREVIOUS. Each row is rewritten only if it still holds the
 * value that was read, so several instances booting at once, or a token refresh landing
 * mid-backfill, can't overwrite anything newer. Once the log reports nothing left under the
 * previous key, DATA_ENCRYPTION_KEY_PREVIOUS can be removed.
 */
@Injectable()
export class SecretsBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecretsBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.run().catch((err) => this.logger.error(`Encrypting stored secrets failed: ${(err as Error).message}`));
  }

  async run(): Promise<number> {
    let rewritten = 0;
    for (const { model, fields } of ENCRYPTED_COLUMNS) {
      const delegate = (this.prisma as unknown as Record<string, Delegate>)[model];
      for (const field of fields) rewritten += await this.backfillColumn(delegate, field);
    }
    if (rewritten > 0) this.logger.log(`Encrypted ${rewritten} stored secret(s) with the current key`);
    return rewritten;
  }

  private async backfillColumn(delegate: Delegate, field: string): Promise<number> {
    let rewritten = 0;
    const skipped = new Set<string>();
    for (;;) {
      const rows = await delegate.findMany({
        where: {
          [field]: { not: "" },
          // Everything not already under the current key: plaintext, or an older key's ciphertext.
          NOT: { [field]: { startsWith: currentKeyPrefix() } },
          ...(skipped.size > 0 && { id: { notIn: [...skipped] } }),
        },
        select: { id: true, [field]: true },
        take: BATCH,
      });
      if (rows.length === 0) return rewritten;
      for (const row of rows) {
        const stored = row[field];
        if (stored == null || isEncryptedWithCurrentKey(stored)) continue;
        let next: string;
        try {
          next = encryptSecret(decryptSecret(stored));
        } catch (err) {
          // Encrypted under a key that's no longer configured — can't be recovered here; leave it
          // (the connection will need reconnecting) rather than retrying it forever.
          skipped.add(row.id as string);
          this.logger.error(`Can't re-encrypt ${field} of ${row.id}: ${(err as Error).message}`);
          continue;
        }
        const { count } = await delegate.updateMany({ where: { id: row.id, [field]: stored }, data: { [field]: next } });
        rewritten += count;
        if (count === 0) skipped.add(row.id as string); // changed meanwhile — the newer write is already encrypted
      }
    }
  }
}
