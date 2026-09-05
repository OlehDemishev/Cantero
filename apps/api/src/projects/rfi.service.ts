import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AnswerRfiInput,
  BallInCourtParty,
  BulkActionResult,
  CreateRfiInput,
  LinkCostImpactChangeOrderInput,
  SetDrawingPinInput,
  SetRfiBallInCourtInput,
  UpdateRfiInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { calculateCostImpactSummary, type CostImpactSourceItem } from "./cost-impact-summary";
import { calculateRfiAnalytics } from "./rfi-analytics";

@Injectable()
export class RfiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  async listForProject(companyId: string, projectId: string, ballInCourtParty?: BallInCourtParty) {
    await this.assertProject(companyId, projectId);
    return this.prisma.rfi.findMany({
      where: { projectId, ...(ballInCourtParty ? { ballInCourtParty } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  /** Every open RFI across every project the company has — the cross-project counterpart to listForProject, for a company-wide "open items" view. */
  async listOpenForCompany(companyId: string) {
    return this.prisma.rfi.findMany({
      where: { companyId, status: { not: "closed" } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(companyId: string, id: string) {
    const rfi = await this.prisma.rfi.findFirst({ where: { id, companyId } });
    if (!rfi) throw new NotFoundException("RFI not found");
    return rfi;
  }

  async create(companyId: string, actor: AuditActor, input: CreateRfiInput) {
    const project = await this.assertProject(companyId, input.projectId);

    const existingCount = await this.prisma.rfi.count({ where: { projectId: input.projectId } });
    const number = `RFI-${String(existingCount + 1).padStart(3, "0")}`;

    const rfi = await this.prisma.rfi.create({
      data: {
        companyId,
        projectId: input.projectId,
        number,
        subject: input.subject,
        question: input.question,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        costImpact: input.costImpact,
        estimatedCostImpact: input.estimatedCostImpact,
        scheduleImpactDays: input.scheduleImpactDays,
        askedByUserId: actor.userId,
        askedByName: actor.name,
      },
    });
    this.audit.record(companyId, actor, "rfi.created", "Rfi", rfi.id, `Raised ${number} on "${project.name}": ${rfi.subject}`);
    return rfi;
  }

  async update(companyId: string, id: string, input: UpdateRfiInput) {
    const rfi = await this.get(companyId, id);
    return this.prisma.rfi.update({
      where: { id: rfi.id },
      data: {
        subject: input.subject,
        question: input.question,
        priority: input.priority,
        dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
        costImpact: input.costImpact,
        estimatedCostImpact: input.estimatedCostImpact,
        scheduleImpactDays: input.scheduleImpactDays,
      },
    });
  }

  /** Links this RFI to the change order raised as its consequence — turns its estimatedCostImpact
   * from a guess into a confirmed figure backed by an actual priced/approved change order. Pass
   * changeOrderId: null to unlink. */
  async linkChangeOrder(companyId: string, id: string, input: LinkCostImpactChangeOrderInput) {
    const rfi = await this.get(companyId, id);
    if (input.changeOrderId) {
      const changeOrder = await this.prisma.changeOrder.findFirst({ where: { id: input.changeOrderId, companyId } });
      if (!changeOrder) throw new NotFoundException("Change order not found");
    }
    return this.prisma.rfi.update({ where: { id: rfi.id }, data: { changeOrderId: input.changeOrderId } });
  }

  async setBallInCourt(companyId: string, actor: AuditActor, id: string, input: SetRfiBallInCourtInput) {
    const rfi = await this.get(companyId, id);
    const updated = await this.prisma.rfi.update({ where: { id: rfi.id }, data: { ballInCourtParty: input.ballInCourtParty } });
    this.audit.record(
      companyId,
      actor,
      "rfi.ball_in_court_changed",
      "Rfi",
      rfi.id,
      `Set ball-in-court to "${input.ballInCourtParty}" on ${rfi.number}`,
    );
    return updated;
  }

  async setPin(companyId: string, id: string, input: SetDrawingPinInput) {
    const rfi = await this.get(companyId, id);
    if (input.drawingSheetId) {
      const sheet = await this.prisma.drawingSheet.findFirst({ where: { id: input.drawingSheetId, companyId } });
      if (!sheet) throw new NotFoundException("Drawing sheet not found");
    }
    return this.prisma.rfi.update({
      where: { id: rfi.id },
      data: { drawingSheetId: input.drawingSheetId, pinX: input.pinX, pinY: input.pinY },
    });
  }

  async answer(companyId: string, actor: AuditActor, id: string, input: AnswerRfiInput) {
    const rfi = await this.get(companyId, id);
    if (rfi.status === "closed") throw new BadRequestException("RFI is closed — reopen it before answering");

    const updated = await this.prisma.rfi.update({
      where: { id: rfi.id },
      data: { status: "answered", answer: input.answer, answeredAt: new Date(), answeredByUserId: actor.userId, answeredByName: actor.name },
    });
    this.audit.record(companyId, actor, "rfi.answered", "Rfi", rfi.id, `Answered ${rfi.number}: ${rfi.subject}`);
    this.webhooks.trigger(companyId, "rfi.answered", { rfiId: rfi.id, number: rfi.number, subject: rfi.subject });
    return updated;
  }

  async close(companyId: string, actor: AuditActor, id: string) {
    const rfi = await this.get(companyId, id);
    if (rfi.status === "closed") throw new BadRequestException("RFI is already closed");

    const updated = await this.prisma.rfi.update({
      where: { id: rfi.id },
      data: { status: "closed", closedAt: new Date(), closedByUserId: actor.userId, closedByName: actor.name },
    });
    this.audit.record(companyId, actor, "rfi.closed", "Rfi", rfi.id, `Closed ${rfi.number}: ${rfi.subject}`);
    this.webhooks.trigger(companyId, "rfi.closed", { rfiId: rfi.id, number: rfi.number, subject: rfi.subject });
    return updated;
  }

  async reopen(companyId: string, actor: AuditActor, id: string) {
    const rfi = await this.get(companyId, id);
    if (rfi.status !== "closed") throw new BadRequestException("RFI is not closed");

    const updated = await this.prisma.rfi.update({
      where: { id: rfi.id },
      data: { status: rfi.answer ? "answered" : "open", closedAt: null, closedByUserId: null, closedByName: null },
    });
    this.audit.record(companyId, actor, "rfi.reopened", "Rfi", rfi.id, `Reopened ${rfi.number}: ${rfi.subject}`);
    return updated;
  }

  async bulkClose(companyId: string, actor: AuditActor, ids: string[]): Promise<BulkActionResult> {
    const result: BulkActionResult = { succeeded: 0, failed: [] };
    for (const id of ids) {
      try {
        await this.close(companyId, actor, id);
        result.succeeded++;
      } catch (err) {
        result.failed.push({ id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  /** Combines this project's cost-impact-carrying RFIs and punch list items into one report — see cost-impact-summary.ts. */
  async costImpactSummary(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);

    const [rfis, punchListItems] = await Promise.all([
      this.prisma.rfi.findMany({
        where: { projectId, OR: [{ estimatedCostImpact: { not: null } }, { changeOrderId: { not: null } }] },
        select: { id: true, number: true, subject: true, estimatedCostImpact: true, changeOrder: { select: { grandTotal: true } } },
      }),
      this.prisma.punchListItem.findMany({
        where: { projectId, OR: [{ estimatedCostImpact: { not: null } }, { changeOrderId: { not: null } }] },
        select: { id: true, title: true, estimatedCostImpact: true, changeOrder: { select: { grandTotal: true } } },
      }),
    ]);

    const items: CostImpactSourceItem[] = [
      ...rfis.map((r) => ({
        type: "rfi" as const,
        id: r.id,
        label: `${r.number} — ${r.subject}`,
        estimatedCostImpact: r.estimatedCostImpact !== null ? Number(r.estimatedCostImpact) : null,
        confirmedAmount: r.changeOrder ? Number(r.changeOrder.grandTotal) : null,
      })),
      ...punchListItems.map((p) => ({
        type: "punch_list" as const,
        id: p.id,
        label: p.title,
        estimatedCostImpact: p.estimatedCostImpact !== null ? Number(p.estimatedCostImpact) : null,
        confirmedAmount: p.changeOrder ? Number(p.changeOrder.grandTotal) : null,
      })),
    ];

    return calculateCostImpactSummary(items);
  }

  /** Turnaround-time analytics for a project's RFI log — see rfi-analytics.ts. */
  async analytics(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);

    const rfis = await this.prisma.rfi.findMany({
      where: { projectId },
      select: { id: true, number: true, status: true, ballInCourtParty: true, createdAt: true, dueDate: true, answeredAt: true },
    });

    return calculateRfiAnalytics(rfis, new Date());
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
