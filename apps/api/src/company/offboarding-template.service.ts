import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateOffboardingTemplateItemInput, UpdateOffboardingTemplateItemInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class OffboardingTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.offboardingTemplateItem.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, input: CreateOffboardingTemplateItemInput) {
    const count = await this.prisma.offboardingTemplateItem.count({ where: { companyId } });
    const item = await this.prisma.offboardingTemplateItem.create({
      data: { companyId, title: input.title, sortOrder: count },
    });
    this.audit.record(companyId, actor, "offboarding_template_item.created", "OffboardingTemplateItem", item.id, `Added offboarding checklist item "${input.title}"`);
    return item;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateOffboardingTemplateItemInput) {
    const item = await this.prisma.offboardingTemplateItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Offboarding checklist item not found");
    const updated = await this.prisma.offboardingTemplateItem.update({ where: { id }, data: input });
    this.audit.record(companyId, actor, "offboarding_template_item.updated", "OffboardingTemplateItem", id, `Updated offboarding checklist item "${updated.title}"`);
    return updated;
  }

  async delete(companyId: string, actor: AuditActor, id: string) {
    const item = await this.prisma.offboardingTemplateItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Offboarding checklist item not found");
    await this.prisma.offboardingTemplateItem.delete({ where: { id } });
    this.audit.record(companyId, actor, "offboarding_template_item.deleted", "OffboardingTemplateItem", id, `Deleted offboarding checklist item "${item.title}"`);
    return { ok: true };
  }
}
