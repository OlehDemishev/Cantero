import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BulkActionResult,
  ChecklistTemplateType,
  CreateChecklistTemplateInput,
  UpdateChecklistTemplateInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { PunchListService } from "../projects/punch-list.service";

@Injectable()
export class ChecklistTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly punchList: PunchListService,
  ) {}

  list(companyId: string, type?: ChecklistTemplateType) {
    return this.prisma.checklistTemplate.findMany({
      where: { companyId, ...(type ? { type } : {}) },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id, companyId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  async create(companyId: string, actor: AuditActor, input: CreateChecklistTemplateInput) {
    const template = await this.prisma.checklistTemplate.create({
      data: {
        companyId,
        type: input.type,
        name: input.name,
        defaultSubject: input.defaultSubject,
        defaultBody: input.defaultBody,
        defaultHazards: input.defaultHazards,
        defaultControlMeasures: input.defaultControlMeasures,
        defaultPpe: input.defaultPpe,
        items: input.items ? { create: input.items.map((item, i) => ({ ...item, sortOrder: i })) } : undefined,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    this.audit.record(companyId, actor, "checklist_template.created", "ChecklistTemplate", template.id, `Created template "${template.name}"`);
    return template;
  }

  async update(companyId: string, id: string, input: UpdateChecklistTemplateInput) {
    const template = await this.get(companyId, id);
    if (input.items) {
      await this.prisma.checklistTemplateItem.deleteMany({ where: { templateId: template.id } });
    }
    return this.prisma.checklistTemplate.update({
      where: { id: template.id },
      data: {
        name: input.name,
        defaultSubject: input.defaultSubject,
        defaultBody: input.defaultBody,
        defaultHazards: input.defaultHazards,
        defaultControlMeasures: input.defaultControlMeasures,
        defaultPpe: input.defaultPpe,
        items: input.items ? { create: input.items.map((item, i) => ({ ...item, sortOrder: i })) } : undefined,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.checklistTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** Only punch_list templates can be applied — bulk-creates one PunchListItem per template item
   * via the real PunchListService.create() (so validation/audit stay consistent), tolerant of
   * per-item failure like the rest of this codebase's bulk operations. */
  async apply(companyId: string, actor: AuditActor, id: string, projectId: string) {
    const template = await this.get(companyId, id);
    if (template.type !== "punch_list") throw new BadRequestException("Only punch list templates can be applied to a project");

    const result: BulkActionResult = { succeeded: 0, failed: [] };
    for (const item of template.items) {
      try {
        await this.punchList.create(companyId, actor, {
          projectId,
          title: item.title,
          description: item.description ?? undefined,
          location: item.location ?? undefined,
        });
        result.succeeded++;
      } catch (err) {
        result.failed.push({ id: item.id, message: err instanceof Error ? err.message : String(err) });
      }
    }

    this.audit.record(
      companyId,
      actor,
      "checklist_template.applied",
      "ChecklistTemplate",
      template.id,
      `Applied "${template.name}" to a project, created ${result.succeeded} item(s)`,
    );
    return result;
  }
}
