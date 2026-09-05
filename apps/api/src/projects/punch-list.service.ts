import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BulkActionResult,
  CreatePunchListItemInput,
  LinkPunchListChangeOrderInput,
  SetDrawingPinInput,
  UpdatePunchListItemInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

@Injectable()
export class PunchListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.punchListItem.findMany({
      where: { projectId },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.punchListItem.findFirst({
      where: { id, companyId },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException("Punch list item not found");
    return item;
  }

  async create(companyId: string, actor: AuditActor, input: CreatePunchListItemInput) {
    await this.assertProject(companyId, input.projectId);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);
    if (input.assigneeSubcontractorId) await this.assertSubcontractor(companyId, input.assigneeSubcontractorId);

    const item = await this.prisma.punchListItem.create({
      data: {
        companyId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
        assigneeSubcontractorId: input.assigneeSubcontractorId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimatedCostImpact: input.estimatedCostImpact,
        createdByUserId: actor.userId,
        createdByName: actor.name,
      },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.created", "PunchListItem", item.id, `Logged punch list item "${item.title}"`);
    return item;
  }

  /** Same estimate-then-confirm-via-CO pattern as RfiService.linkChangeOrder(). */
  async linkChangeOrder(companyId: string, id: string, input: LinkPunchListChangeOrderInput) {
    const item = await this.get(companyId, id);
    if (input.changeOrderId) {
      const changeOrder = await this.prisma.changeOrder.findFirst({ where: { id: input.changeOrderId, companyId } });
      if (!changeOrder) throw new NotFoundException("Change order not found");
    }
    return this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { changeOrderId: input.changeOrderId },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
  }

  async setPin(companyId: string, id: string, input: SetDrawingPinInput) {
    const item = await this.get(companyId, id);
    if (input.drawingSheetId) {
      const sheet = await this.prisma.drawingSheet.findFirst({ where: { id: input.drawingSheetId, companyId } });
      if (!sheet) throw new NotFoundException("Drawing sheet not found");
    }
    return this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { drawingSheetId: input.drawingSheetId, pinX: input.pinX, pinY: input.pinY },
    });
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdatePunchListItemInput) {
    const existing = await this.get(companyId, id);
    if (input.assigneeWorkerId) await this.assertWorker(companyId, input.assigneeWorkerId);
    if (input.assigneeSubcontractorId) await this.assertSubcontractor(companyId, input.assigneeSubcontractorId);

    return this.prisma.punchListItem.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        assigneeWorkerId: input.assigneeWorkerId,
        assigneeSubcontractorId: input.assigneeSubcontractorId,
        dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
        estimatedCostImpact: input.estimatedCostImpact,
      },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
  }

  async resolve(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "open") throw new BadRequestException(`Item is already ${item.status}`);

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { status: "resolved", resolvedAt: new Date(), resolvedByUserId: actor.userId, resolvedByName: actor.name },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.resolved", "PunchListItem", item.id, `Marked "${item.title}" resolved`);
    this.webhooks.trigger(companyId, "punch_list.resolved", { punchListItemId: item.id, title: item.title });
    return updated;
  }

  async verify(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status !== "resolved") throw new BadRequestException("Only a resolved item can be verified");

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { status: "verified", verifiedAt: new Date(), verifiedByUserId: actor.userId, verifiedByName: actor.name },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.verified", "PunchListItem", item.id, `Verified fix for "${item.title}"`);
    this.webhooks.trigger(companyId, "punch_list.verified", { punchListItemId: item.id, title: item.title });
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string) {
    const item = await this.get(companyId, id);
    if (item.status === "open") throw new BadRequestException("Item is already open");

    const updated = await this.prisma.punchListItem.update({
      where: { id: item.id },
      data: {
        status: "open",
        resolvedAt: null,
        resolvedByUserId: null,
        resolvedByName: null,
        verifiedAt: null,
        verifiedByUserId: null,
        verifiedByName: null,
      },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "punch_list.reopened", "PunchListItem", item.id, `Reopened "${item.title}"`);
    return updated;
  }

  /** Each id is resolved independently via the same guarded resolve() — one bad id never blocks the rest. */
  async bulkResolve(companyId: string, actor: AuditActor, ids: string[]): Promise<BulkActionResult> {
    return this.bulkRun(ids, (id) => this.resolve(companyId, actor, id));
  }

  async bulkVerify(companyId: string, actor: AuditActor, ids: string[]): Promise<BulkActionResult> {
    return this.bulkRun(ids, (id) => this.verify(companyId, actor, id));
  }

  private async bulkRun(ids: string[], run: (id: string) => Promise<unknown>): Promise<BulkActionResult> {
    const result: BulkActionResult = { succeeded: 0, failed: [] };
    for (const id of ids) {
      try {
        await run(id);
        result.succeeded++;
      } catch (err) {
        result.failed.push({ id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
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

  private async assertSubcontractor(companyId: string, subcontractorId: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new BadRequestException("Assignee does not belong to this company");
    return subcontractor;
  }

  /** A subcontractor's own view through the portal — every punch list item assigned to them,
   * across whichever of the company's projects they're working on. */
  listForSubcontractor(companyId: string, subcontractorId: string) {
    return this.prisma.punchListItem.findMany({
      where: { companyId, assigneeSubcontractorId: subcontractorId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }
}
