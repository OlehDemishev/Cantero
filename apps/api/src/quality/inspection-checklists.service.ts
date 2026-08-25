import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDeficiencyFromItemInput, CreateInspectionChecklistInput, RecordInspectionItemResultInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { DeficienciesService } from "./deficiencies.service";

@Injectable()
export class InspectionChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly deficiencies: DeficienciesService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.inspectionChecklist.findMany({
      where: { projectId },
      include: { items: { orderBy: { sortOrder: "asc" } }, inspector: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const checklist = await this.prisma.inspectionChecklist.findFirst({
      where: { id, companyId },
      include: { items: { orderBy: { sortOrder: "asc" } }, inspector: { select: { id: true, name: true } } },
    });
    if (!checklist) throw new NotFoundException("Inspection checklist not found");
    return checklist;
  }

  /** Clones the template's items if templateId is given (same clone-on-use pattern as the worker
   * onboarding template) — otherwise uses the ad-hoc items list passed in directly. */
  async create(companyId: string, actor: AuditActor, input: CreateInspectionChecklistInput) {
    await this.assertProject(companyId, input.projectId);
    if (input.inspectorWorkerId) await this.assertWorker(companyId, input.inspectorWorkerId);

    let itemDescriptions: string[];
    if (input.templateId) {
      const template = await this.prisma.inspectionTemplate.findFirst({
        where: { id: input.templateId, companyId },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (!template) throw new NotFoundException("Inspection template not found");
      itemDescriptions = template.items.map((i) => i.description);
    } else {
      itemDescriptions = (input.items ?? []).map((i) => i.description);
    }
    if (itemDescriptions.length === 0) throw new BadRequestException("At least one checklist item is required");

    const checklist = await this.prisma.inspectionChecklist.create({
      data: {
        companyId,
        projectId: input.projectId,
        templateId: input.templateId,
        name: input.name,
        trade: input.trade,
        phase: input.phase,
        inspectorWorkerId: input.inspectorWorkerId,
        items: { create: itemDescriptions.map((description, i) => ({ description, sortOrder: i })) },
      },
      include: { items: { orderBy: { sortOrder: "asc" } }, inspector: { select: { id: true, name: true } } },
    });
    this.audit.record(
      companyId,
      actor,
      "inspection_checklist.created",
      "InspectionChecklist",
      checklist.id,
      `Started inspection "${checklist.name}" (${checklist.trade})`,
    );
    return checklist;
  }

  async recordItemResult(companyId: string, id: string, itemId: string, input: RecordInspectionItemResultInput) {
    const checklist = await this.get(companyId, id);
    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Checklist item not found");

    return this.prisma.inspectionChecklistItem.update({
      where: { id: itemId },
      data: { result: input.result, notes: input.notes },
    });
  }

  /** Raises a Deficiency from a failed checklist item — not automatic on every "fail" result,
   * since not every failed check needs formal tracking; the inspector decides. */
  async createDeficiencyFromItem(
    companyId: string,
    actor: AuditActor,
    id: string,
    itemId: string,
    input: CreateDeficiencyFromItemInput,
  ) {
    const checklist = await this.get(companyId, id);
    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Checklist item not found");
    return this.deficiencies.createFromItem(companyId, actor, checklist.projectId, item.id, item.description, input);
  }

  /** Closes out the inspection: failed if any item is still "fail" or has an unresolved
   * deficiency, passed otherwise (pending/na items don't block a pass). */
  async complete(companyId: string, actor: AuditActor, id: string) {
    const checklist = await this.get(companyId, id);
    if (checklist.status !== "open") throw new BadRequestException(`Inspection is already ${checklist.status}`);

    const hasFailure = checklist.items.some((i) => i.result === "fail");
    const status = hasFailure ? "failed" : "passed";

    const updated = await this.prisma.inspectionChecklist.update({
      where: { id: checklist.id },
      data: { status, inspectedAt: new Date() },
      include: { items: { orderBy: { sortOrder: "asc" } }, inspector: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "inspection_checklist.completed", "InspectionChecklist", checklist.id, `Completed inspection "${checklist.name}" — ${status}`);
    return updated;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertWorker(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new BadRequestException("Inspector does not belong to this company");
    return worker;
  }
}
