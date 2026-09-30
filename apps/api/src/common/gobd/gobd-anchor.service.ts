import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { GOBD_ANCHOR_QUEUE } from "../queue/queue.module";
import { requestTimestamp, verifyTimestampToken } from "./timestamp";

const ANCHOR_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface GobdAnchorVerification {
  /** Whether every stored timestamp still matches its ledger entry and checks out cryptographically. */
  valid: boolean;
  anchorCount: number;
  lastSequence: number | null;
  lastTimestampedAt: Date | null;
  /** Ledger entries written since the last timestamp — protected by the hash chain alone until the
   * next one. */
  entriesSinceLast: number;
  /** The first anchored sequence that no longer checks out, and why. */
  brokenAtSequence: number | null;
  reason: string | null;
}

/**
 * Anchors each company's GoBD ledger outside the database: once a day the worker has an outside
 * Time Stamping Authority (GOBD_TSA_URL, RFC 3161) timestamp the hash of the ledger's newest entry.
 * The ledger's own hash chain shows an edit, but someone with database access could recompute the
 * whole chain; a signed timestamp of an earlier head hash can't be recomputed. Turned off while
 * GOBD_TSA_URL is unset (production warns about it at startup).
 */
@Injectable()
export class GobdAnchorService implements OnModuleInit {
  private readonly logger = new Logger(GobdAnchorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(GOBD_ANCHOR_QUEUE) private readonly queue: Queue,
  ) {}

  get tsaUrl(): string | undefined {
    return this.config.get<string>("GOBD_TSA_URL")?.trim() || undefined;
  }

  async onModuleInit() {
    if (!this.tsaUrl) {
      // The schedule lives in Redis, so turning the TSA off has to take it down too.
      await this.queue.removeRepeatable("anchor-all", { every: ANCHOR_INTERVAL_MS }, "gobd-anchor-repeat");
      return;
    }
    // Same jobId + repeat options on every boot — BullMQ dedupes rather than stacking repeats.
    await this.queue.add("anchor-all", {}, { repeat: { every: ANCHOR_INTERVAL_MS }, jobId: "gobd-anchor-repeat" });
  }

  /** Timestamps every company's ledger head that isn't timestamped yet. One company's failure (the
   * TSA briefly unreachable) doesn't stop the others; the job still fails afterwards, so it's
   * reported and retried. */
  async anchorAll(): Promise<{ anchored: number }> {
    if (!this.tsaUrl) return { anchored: 0 };
    const companies = await this.prisma.gobdLedgerEntry.findMany({ distinct: ["companyId"], select: { companyId: true } });
    let anchored = 0;
    const failures: string[] = [];
    for (const { companyId } of companies) {
      try {
        if (await this.anchor(companyId)) anchored++;
      } catch (err) {
        failures.push(`${companyId}: ${(err as Error).message}`);
      }
    }
    if (anchored > 0) this.logger.log(`GoBD ledger: timestamped ${anchored} company ledger head(s)`);
    if (failures.length > 0) throw new Error(`Couldn't timestamp ${failures.length} ledger(s): ${failures.join("; ")}`);
    return { anchored };
  }

  /** Timestamps the company's ledger head, unless it already is. Returns the new anchor, if any. */
  async anchor(companyId: string) {
    const tsaUrl = this.tsaUrl;
    if (!tsaUrl) throw new BadRequestException("No timestamp authority is configured on this server (GOBD_TSA_URL)");
    const head = await this.prisma.gobdLedgerEntry.findFirst({ where: { companyId }, orderBy: { sequence: "desc" } });
    if (!head) return null;
    const last = await this.prisma.gobdLedgerAnchor.findFirst({ where: { companyId }, orderBy: { sequence: "desc" } });
    if (last && last.sequence >= head.sequence) return null;

    const { token, timestampedAt } = await requestTimestamp(tsaUrl, Buffer.from(head.hash, "hex"));
    try {
      return await this.prisma.gobdLedgerAnchor.create({
        data: { companyId, sequence: head.sequence, hash: head.hash, tsaUrl, token, timestampedAt },
        select: ANCHOR_SUMMARY,
      });
    } catch (err) {
      // Anchored concurrently (the daily job and "timestamp now" at once) — the head is covered.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    }
  }

  list(companyId: string) {
    return this.prisma.gobdLedgerAnchor.findMany({ where: { companyId }, orderBy: { sequence: "desc" }, select: ANCHOR_SUMMARY });
  }

  /** The token as the TSA returned it, for checking independently with `openssl ts -verify`. */
  async token(companyId: string, id: string): Promise<{ token: Buffer; sequence: number }> {
    const anchor = await this.prisma.gobdLedgerAnchor.findFirst({ where: { id, companyId }, select: { token: true, sequence: true } });
    if (!anchor) throw new NotFoundException("Timestamp not found");
    return { token: Buffer.from(anchor.token), sequence: anchor.sequence };
  }

  /** Checks every stored timestamp: its entry still carries the hash that was timestamped, and the
   * token is intact and signed by a trusted TSA. */
  async verify(companyId: string): Promise<GobdAnchorVerification> {
    const [anchors, head] = await Promise.all([
      this.prisma.gobdLedgerAnchor.findMany({ where: { companyId }, orderBy: { sequence: "asc" } }),
      this.prisma.gobdLedgerEntry.findFirst({ where: { companyId }, orderBy: { sequence: "desc" }, select: { sequence: true } }),
    ]);
    const entries = await this.prisma.gobdLedgerEntry.findMany({
      where: { companyId, sequence: { in: anchors.map((a) => a.sequence) } },
      select: { sequence: true, hash: true },
    });
    const hashAt = new Map(entries.map((e) => [e.sequence, e.hash]));
    const last = anchors.at(-1);
    const result = {
      anchorCount: anchors.length,
      lastSequence: last?.sequence ?? null,
      lastTimestampedAt: last?.timestampedAt ?? null,
      entriesSinceLast: (head?.sequence ?? 0) - (last?.sequence ?? 0),
    };

    for (const anchor of anchors) {
      if (hashAt.get(anchor.sequence) !== anchor.hash) {
        return { ...result, valid: false, brokenAtSequence: anchor.sequence, reason: "the entry no longer has the hash that was timestamped" };
      }
      const check = await verifyTimestampToken(Buffer.from(anchor.token), Buffer.from(anchor.hash, "hex"));
      if (!check.valid) return { ...result, valid: false, brokenAtSequence: anchor.sequence, reason: check.reason };
    }
    return { ...result, valid: true, brokenAtSequence: null, reason: null };
  }
}

const ANCHOR_SUMMARY = { id: true, sequence: true, hash: true, tsaUrl: true, timestampedAt: true } as const;
