import { createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateApiKeyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const KEY_PREFIX = "cnt_";
const PREFIX_DISPLAY_LENGTH = 12;

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.apiKey.findMany({
      where: { companyId },
      select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** The raw key is returned only here, at creation — it is never persisted or retrievable again. */
  async create(companyId: string, actor: AuditActor, input: CreateApiKeyInput) {
    const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
    const apiKey = await this.prisma.apiKey.create({
      data: {
        companyId,
        name: input.name,
        keyPrefix: rawKey.slice(0, PREFIX_DISPLAY_LENGTH),
        keyHash: hashApiKey(rawKey),
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    });
    this.audit.record(companyId, actor, "api_key.created", "ApiKey", apiKey.id, `Created API key "${apiKey.name}"`);
    return { ...apiKey, key: rawKey };
  }

  async revoke(companyId: string, actor: AuditActor, id: string) {
    const apiKey = await this.prisma.apiKey.findFirst({ where: { id, companyId } });
    if (!apiKey) throw new NotFoundException("API key not found");
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    this.audit.record(companyId, actor, "api_key.revoked", "ApiKey", id, `Revoked API key "${apiKey.name}"`);
    return { ok: true };
  }
}
