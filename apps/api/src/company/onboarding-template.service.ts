import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateOnboardingTemplateItemInput, UpdateOnboardingTemplateItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class OnboardingTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.onboardingTemplateItem.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, input: CreateOnboardingTemplateItemInput) {
    const count = await this.prisma.onboardingTemplateItem.count({ where: { companyId } });
    const item = await this.prisma.onboardingTemplateItem.create({
      data: { companyId, title: input.title, sortOrder: count },
    });
    this.audit.record(companyId, actor, "onboarding_template_item.created", "OnboardingTemplateItem", item.id, `Added onboarding checklist item "${input.title}"`);
    return item;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateOnboardingTemplateItemInput) {
    const item = await this.prisma.onboardingTemplateItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Onboarding checklist item not found");
    const updated = await this.prisma.onboardingTemplateItem.update({ where: { id }, data: input });
    this.audit.record(companyId, actor, "onboarding_template_item.updated", "OnboardingTemplateItem", id, `Updated onboarding checklist item "${updated.title}"`);
    return updated;
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const item = await this.prisma.onboardingTemplateItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Onboarding checklist item not found");
    await this.prisma.onboardingTemplateItem.delete({ where: { id } });
    this.audit.record(companyId, actor, "onboarding_template_item.deleted", "OnboardingTemplateItem", id, `Deleted onboarding checklist item "${item.title}"`);
    return { ok: true };
  }
}
