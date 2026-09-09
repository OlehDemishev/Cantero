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
import { OutboxService } from "../common/webhooks/outbox.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

@Injectable()
export class PunchListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.punchListItem.findMany({
      where: { projectId },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  /** Every open punch-list item across every project the company has — see RfiService.listOpenForCompany for the same cross-project pattern. */
  async listOpenForCompany(companyId: string) {
    return this.prisma.punchListItem.findMany({
      where: { companyId, status: "open" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string, userId?: string, role?: string) {
    const item = await this.prisma.punchListItem.findFirst({
      where: { id, companyId },
      include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException("Punch list item not found");
    await this.projectAccess.assertAccess(companyId, item.projectId, userId, role);
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
  async linkChangeOrder(companyId: string, id: string, input: LinkPunchListChangeOrderInput, userId?: string, role?: string) {
    const item = await this.get(companyId, id, userId, role);
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

  async setPin(companyId: string, id: string, input: SetDrawingPinInput, userId?: string, role?: string) {
    const item = await this.get(companyId, id, userId, role);
    if (input.drawingSheetId) {
      const sheet = await this.prisma.drawingSheet.findFirst({ where: { id: input.drawingSheetId, companyId } });
      if (!sheet) throw new NotFoundException("Drawing sheet not found");
    }
    return this.prisma.punchListItem.update({
      where: { id: item.id },
      data: { drawingSheetId: input.drawingSheetId, pinX: input.pinX, pinY: input.pinY },
    });
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdatePunchListItemInput, userId?: string, role?: string) {
    const existing = await this.get(companyId, id, userId, role);
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

  async resolve(companyId: string, actor: AuditActor, id: string, userId?: string, role?: string) {
    const item = await this.get(companyId, id, userId, role);
    if (item.status !== "open") throw new BadRequestException(`Item is already ${item.status}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.punchListItem.update({
        where: { id: item.id },
        data: { status: "resolved", resolvedAt: new Date(), resolvedByUserId: actor.userId, resolvedByName: actor.name },
        include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
      });
      await this.outbox.enqueue(tx, companyId, "punch_list.resolved", { punchListItemId: item.id, title: item.title });
      return updated;
    });
    this.audit.record(companyId, actor, "punch_list.resolved", "PunchListItem", item.id, `Marked "${item.title}" resolved`);
    return updated;
  }

  async verify(companyId: string, actor: AuditActor, id: string, userId?: string, role?: string) {
    const item = await this.get(companyId, id, userId, role);
    if (item.status !== "resolved") throw new BadRequestException("Only a resolved item can be verified");

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.punchListItem.update({
        where: { id: item.id },
        data: { status: "verified", verifiedAt: new Date(), verifiedByUserId: actor.userId, verifiedByName: actor.name },
        include: { assignee: { select: { id: true, name: true } }, assigneeSubcontractor: { select: { id: true, name: true } } },
      });
      await this.outbox.enqueue(tx, companyId, "punch_list.verified", { punchListItemId: item.id, title: item.title });
      return updated;
    });
    this.audit.record(companyId, actor, "punch_list.verified", "PunchListItem", item.id, `Verified fix for "${item.title}"`);
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string, userId?: string, role?: string) {
    const item = await this.get(companyId, id, userId, role);
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
  async bulkResolve(companyId: string, actor: AuditActor, ids: string[], userId?: string, role?: string): Promise<BulkActionResult> {
    return this.bulkRun(ids, (id) => this.resolve(companyId, actor, id, userId, role));
  }

  async bulkVerify(companyId: string, actor: AuditActor, ids: string[], userId?: string, role?: string): Promise<BulkActionResult> {
    return this.bulkRun(ids, (id) => this.verify(companyId, actor, id, userId, role));
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

  /** A printable log of a project's punch list — for handing to a client or subcontractor who doesn't have an account, same PdfService table shape as invoices/estimates. */
  async generatePdf(companyId: string, projectId: string): Promise<Buffer> {
    const project = await this.assertProject(companyId, projectId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;
    const items = await this.prisma.punchListItem.findMany({
      where: { projectId },
      include: { assignee: { select: { name: true } }, assigneeSubcontractor: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return this.pdf.render({
      title: `Punch List — ${project.name}`,
      subtitle: `${items.length} item(s)`,
      meta: [{ label: "Generated", value: new Date().toISOString().slice(0, 10) }],
      tableHeader: ["Item", "Location", "Status", "Assignee", "Due date"],
      tableRows: items.map((item) => ({
        cells: [
          item.title,
          item.location ?? "—",
          item.status,
          item.assignee?.name ?? item.assigneeSubcontractor?.name ?? "—",
          item.dueDate ? item.dueDate.toISOString().slice(0, 10) : "—",
        ],
      })),
      totals: [],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }
}
