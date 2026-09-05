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
      where: { companyId, archivedAt: null, ...(type ? { type } : {}) },
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

  /** Never mutates the template in place — clones a new version so a past inspection's audit
   * trail keeps pointing at the exact configuration used, then archives the old row. */
  async update(companyId: string, actor: AuditActor, id: string, input: UpdateChecklistTemplateInput) {
    const template = await this.get(companyId, id);

    const nextVersion = await this.prisma.checklistTemplate.create({
      data: {
        companyId,
        type: template.type,
        name: input.name ?? template.name,
        defaultSubject: input.defaultSubject ?? template.defaultSubject,
        defaultBody: input.defaultBody ?? template.defaultBody,
        defaultHazards: input.defaultHazards ?? template.defaultHazards,
        defaultControlMeasures: input.defaultControlMeasures ?? template.defaultControlMeasures,
        defaultPpe: input.defaultPpe ?? template.defaultPpe,
        version: template.version + 1,
        previousVersionId: template.id,
        items: {
          create: (input.items ?? template.items.map((item) => ({ title: item.title, description: item.description, location: item.location }))).map(
            (item, i) => ({ ...item, sortOrder: i }),
          ),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });

    await this.prisma.checklistTemplate.update({ where: { id: template.id }, data: { archivedAt: new Date() } });

    this.audit.record(
      companyId,
      actor,
      "checklist_template.versioned",
      "ChecklistTemplate",
      nextVersion.id,
      `Created v${nextVersion.version} of "${nextVersion.name}", superseding v${template.version}`,
    );
    return nextVersion;
  }

  /** Walks the previousVersion chain, newest first, so the UI can show what a template looked like at any point. */
  async history(companyId: string, id: string) {
    const versions = [];
    let current = await this.get(companyId, id);
    versions.push(current);
    while (current.previousVersionId) {
      current = await this.get(companyId, current.previousVersionId);
      versions.push(current);
    }
    return versions;
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
