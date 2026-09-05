import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDeficiencyFromItemInput, UpdateDeficiencyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateDeficiencyHeatmap } from "./deficiency-heatmap";

@Injectable()
export class DeficienciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.deficiency.findMany({
      where: { projectId },
      include: { assignee: { select: { id: true, name: true } }, inspectionChecklistItem: { select: { id: true, description: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.deficiency.findFirst({
      where: { id, companyId },
      include: { assignee: { select: { id: true, name: true } }, inspectionChecklistItem: { select: { id: true, description: true } } },
    });
    if (!item) throw new NotFoundException("Deficiency not found");
    return item;
  }

  /** Internal helper — an InspectionChecklistItem's fail result becomes a Deficiency. Raising it
   * separately from the two isn't forced (a fail can be noted without ever raising one), but this
   * is the path when the inspector decides it needs to be tracked and fixed. */
  async createFromItem(
    companyId: string,
    actor: AuditActor,
    projectId: string,
    inspectionChecklistItemId: string,
    defaultDescription: string,
    input: CreateDeficiencyFromItemInput,
  ) {
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    const deficiency = await this.prisma.deficiency.create({
      data: {
        companyId,
        projectId,
        inspectionChecklistItemId,
        description: input.description ?? defaultDescription,
        severity: input.severity,
        assigneeWorkerId: input.assigneeWorkerId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        location: input.location,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "deficiency.created", "Deficiency", deficiency.id, `Logged deficiency "${deficiency.description}"`);
    return deficiency;
  }

  async update(companyId: string, id: string, input: UpdateDeficiencyInput) {
    const existing = await this.get(companyId, id);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);

    return this.prisma.deficiency.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        severity: input.severity,
        assigneeWorkerId: input.assigneeWorkerId,
        dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
        location: input.location,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  /** Where defects keep happening on a project, most-affected zone first — see deficiency-heatmap.ts. */
  async heatMap(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    const deficiencies = await this.prisma.deficiency.findMany({
      where: { companyId, projectId },
      select: { location: true, severity: true },
    });
    return calculateDeficiencyHeatmap(deficiencies);
  }

  async resolve(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "open") throw new BadRequestException(`Deficiency is already ${item.status}`);

    const updated = await this.prisma.deficiency.update({
      where: { id: item.id },
      data: { status: "resolved", resolvedAt: new Date() },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "deficiency.resolved", "Deficiency", item.id, `Marked deficiency "${item.description}" resolved`);
    return updated;
  }

  async verify(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "resolved") throw new BadRequestException("Only a resolved deficiency can be verified");

    const updated = await this.prisma.deficiency.update({
      where: { id: item.id },
      data: { status: "verified", verifiedAt: new Date() },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "deficiency.verified", "Deficiency", item.id, `Verified fix for deficiency "${item.description}"`);
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status === "open") throw new BadRequestException("Deficiency is already open");

    const updated = await this.prisma.deficiency.update({
      where: { id: item.id },
      data: { status: "open", resolvedAt: null, verifiedAt: null },
      include: { assignee: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "deficiency.reopened", "Deficiency", item.id, `Reopened deficiency "${item.description}"`);
    return updated;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertWorker(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new BadRequestException("Assignee does not belong to this company");
    return worker;
  }
}
