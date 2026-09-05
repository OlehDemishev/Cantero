import { Injectable } from "@nestjs/common";
import type { SetMarkupRuleInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class MarkupRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.markupRule.findMany({ where: { companyId }, orderBy: { costType: "asc" } });
  }

  /** One rule per cost type — setting an existing type's rule replaces it rather than stacking. */
  async set(companyId: string, actor: AuditActor, input: SetMarkupRuleInput) {
    const rule = await this.prisma.markupRule.upsert({
      where: { companyId_costType: { companyId, costType: input.costType } },
      create: { companyId, costType: input.costType, markupPercent: input.markupPercent },
      update: { markupPercent: input.markupPercent, active: true },
    });
    this.audit.record(companyId, actor, "markup_rule.set", "MarkupRule", rule.id, `Set ${input.costType} markup to ${input.markupPercent}%`);
    return rule;
  }

  async delete(companyId: string, id: string) {
    await this.prisma.markupRule.deleteMany({ where: { id, companyId } });
    return { ok: true };
  }
}
