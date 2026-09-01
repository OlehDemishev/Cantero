import { BadRequestException, Injectable } from "@nestjs/common";
import { MESSAGE_TEMPLATE_KEYS, MESSAGE_TEMPLATE_PLACEHOLDERS, type MessageTemplateKey } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { findUnknownPlaceholders, renderTemplate } from "./render-template";

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string) {
    const overrides = await this.prisma.messageTemplate.findMany({ where: { companyId } });
    const byKey = new Map(overrides.map((o) => [o.key, o]));
    return MESSAGE_TEMPLATE_KEYS.map((key) => {
      const override = byKey.get(key);
      return {
        key,
        placeholders: MESSAGE_TEMPLATE_PLACEHOLDERS[key],
        customBody: override?.body ?? null,
        updatedByName: override?.updatedByName ?? null,
        updatedAt: override?.updatedAt ?? null,
      };
    });
  }

  async upsert(companyId: string, actor: AuditActor, key: MessageTemplateKey, body: string) {
    const unknown = findUnknownPlaceholders(body, MESSAGE_TEMPLATE_PLACEHOLDERS[key]);
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown placeholder(s): ${unknown.map((p) => `{{${p}}}`).join(", ")}`);
    }

    const result = await this.prisma.messageTemplate.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, body, updatedByUserId: actor.userId, updatedByName: actor.name },
      update: { body, updatedByUserId: actor.userId, updatedByName: actor.name },
    });
    this.audit.record(companyId, actor, "message_template.updated", "MessageTemplate", result.id, `Customized the "${key}" message template`);
    return result;
  }

  async reset(companyId: string, actor: AuditActor, key: MessageTemplateKey) {
    await this.prisma.messageTemplate.deleteMany({ where: { companyId, key } });
    this.audit.record(companyId, actor, "message_template.reset", "MessageTemplate", key, `Reset the "${key}" message template to default`);
  }

  /** Null means the company hasn't customized this key — the caller falls back to its own
   * hard-coded (per-locale, for SMS) default. */
  async render(companyId: string, key: MessageTemplateKey, vars: Record<string, string>): Promise<string | null> {
    const override = await this.prisma.messageTemplate.findUnique({ where: { companyId_key: { companyId, key } } });
    if (!override) return null;
    return renderTemplate(override.body, vars);
  }
}
