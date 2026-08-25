import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateExpenseInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

export interface ExpenseFilter {
  projectId?: string;
  workerId?: string;
  status?: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  list(companyId: string, filter: ExpenseFilter) {
    return this.prisma.expense.findMany({
      where: {
        companyId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.workerId ? { workerId: filter.workerId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      include: { worker: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
      orderBy: { incurredAt: "desc" },
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

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: "approved", approvedByUserId: actor.userId, approvedAt: new Date() },
    });
    this.audit.record(companyId, actor, "expense.approved", "Expense", id, `Approved expense of ${expense.amount}`);
    this.webhooks.trigger(companyId, "expense.approved", { expenseId: id, amount: expense.amount.toString() });
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
