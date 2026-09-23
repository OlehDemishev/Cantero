import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateExpenseInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { detectExpenseAnomalyFromAggregate } from "./expense-anomaly";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";

export interface ExpenseFilter {
  projectId?: string;
  workerId?: string;
  /** Only these workers' expenses — how a member without site.crewTime sees just their own. */
  workerIds?: string[];
  status?: string;
}

interface CategoryAggregateRow {
  category: string;
  n: bigint;
  sum: number | null;
  sumsq: number | null;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async list(companyId: string, filter: ExpenseFilter, take: number, cursor?: string, viewer: ProjectViewer = {}) {
    const visible = await this.projectAccess.visibleWhere(companyId, "Expense", viewer.userId, viewer.role);
    const expenses = await this.prisma.expense.findMany({
      where: { AND: [{
        companyId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.workerId ? { workerId: filter.workerId } : {}),
        ...(filter.workerIds ? { workerId: { in: filter.workerIds } } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      }, visible] },
      include: { worker: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
      // incurredAt is a user-entered date, not a generated timestamp — far more likely to
      // collide than an autoincrementing/uuid column, so it needs an id tiebreaker to keep the
      // sort (and therefore cursor pagination) deterministic.
      orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    /** Baseline is every non-rejected expense in the company, by category — not scoped to this
     * list's own filters, so a single-project view still has enough history to compare against.
     * Computed as one grouped aggregate per category (count/sum/sum-of-squares) instead of
     * materializing every historical row and filtering it per displayed expense — the latter was
     * O(N·M) (N = displayed expenses, M = category history size); this is O(N + categories). */
    const aggregates = await this.prisma.$queryRaw<CategoryAggregateRow[]>`
      SELECT category, COUNT(*)::bigint AS n, SUM(amount)::float8 AS sum, SUM(amount * amount)::float8 AS sumsq
      FROM expenses
      WHERE "companyId" = ${companyId} AND status != 'rejected'
      GROUP BY category
    `;
    const byCategory = new Map(
      aggregates.map((a) => [a.category, { n: Number(a.n), sum: a.sum ?? 0, sumSq: a.sumsq ?? 0 }]),
    );

    return expenses.map((e) => {
      const amount = Number(e.amount);
      const agg = byCategory.get(e.category) ?? { n: 0, sum: 0, sumSq: 0 };
      // Leave-one-out: this expense is part of the aggregate above only if it's non-rejected
      // (the same condition the aggregate query itself filters on), so subtract it out only then.
      const baseline =
        e.status !== "rejected" ? { n: agg.n - 1, sum: agg.sum - amount, sumSq: agg.sumSq - amount * amount } : agg;
      return { ...e, anomaly: detectExpenseAnomalyFromAggregate(amount, baseline) };
    });
  }

  async create(companyId: string, input: CreateExpenseInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");

    return this.prisma.expense.create({
      data: {
        companyId,
        projectId: input.projectId,
        workerId: input.workerId,
        category: input.category,
        amount: input.amount,
        description: input.description,
        incurredAt: new Date(input.incurredAt),
      },
      include: { worker: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async uploadReceipt(companyId: string, id: string, file: { originalname: string; mimetype: string; buffer: Buffer }) {
    const expense = await this.findOrThrow(companyId, id);
    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    return this.prisma.expense.update({
      where: { id: expense.id },
      data: { receiptStorageKey: stored.storageKey, receiptMimeType: file.mimetype },
    });
  }

  async downloadReceipt(companyId: string, id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const expense = await this.findOrThrow(companyId, id);
    if (!expense.receiptStorageKey) throw new NotFoundException("No receipt on file for this expense");
    const buffer = await this.storage.read(expense.receiptStorageKey);
    return { buffer, mimeType: expense.receiptMimeType ?? "application/octet-stream" };
  }

  async approve(companyId: string, actor: AuditActor, id: string) {
    const expense = await this.findOrThrow(companyId, id);
    if (expense.status !== "pending") throw new BadRequestException("Only a pending expense can be approved");

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { status: "approved", approvedByUserId: actor.userId, approvedAt: new Date() },
      });
      await this.outbox.enqueue(tx, companyId, "expense.approved", { expenseId: id, amount: expense.amount.toString() });
      return updated;
    });
    this.audit.record(companyId, actor, "expense.approved", "Expense", id, `Approved expense of ${expense.amount}`);
    return updated;
  }

  async reject(companyId: string, actor: AuditActor, id: string, reason: string) {
    const expense = await this.findOrThrow(companyId, id);
    if (expense.status !== "pending") throw new BadRequestException("Only a pending expense can be rejected");

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: "rejected", rejectedReason: reason },
    });
    this.audit.record(companyId, actor, "expense.rejected", "Expense", id, `Rejected expense of ${expense.amount}: ${reason}`);
    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId } });
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }
}
