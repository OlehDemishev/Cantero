import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ImportResult, MatchBankTransactionInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, reconciledOnly?: boolean) {
    return this.prisma.bankTransaction.findMany({
      where: { companyId, ...(reconciledOnly !== undefined ? { reconciled: reconciledOnly } : {}) },
      include: {
        matchedInvoice: { select: { id: true, number: true } },
        matchedExpense: { select: { id: true, description: true } },
      },
      orderBy: { date: "desc" },
    });
  }

  /** CSV columns: date, description, amount. Amount sign is kept as-is from the file — positive
   * for money in, negative for money out — the caller's bank export decides the convention. */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const toCreate: { date: Date; description: string; amount: number }[] = [];
    records.forEach((record, index) => {
      const row = index + 2;
      const date = record.date ? new Date(record.date) : null;
      const amount = record.amount ? Number(record.amount) : NaN;
      if (!date || Number.isNaN(date.getTime())) {
        result.skipped++;
        result.errors.push({ row, message: "Missing or invalid date" });
        return;
      }
      if (Number.isNaN(amount)) {
        result.skipped++;
        result.errors.push({ row, message: "Missing or invalid amount" });
        return;
      }
      toCreate.push({ date, description: record.description?.trim() || "—", amount });
    });

    if (toCreate.length > 0) {
      await this.prisma.bankTransaction.createMany({ data: toCreate.map((t) => ({ ...t, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "bank_transactions.imported",
      "Company",
      companyId,
      `Imported ${result.created} bank transactions from CSV (${result.skipped} skipped)`,
    );
    return result;
  }

  async match(companyId: string, actor: AuditActor, id: string, input: MatchBankTransactionInput) {
    const transaction = await this.prisma.bankTransaction.findFirst({ where: { id, companyId } });
    if (!transaction) throw new NotFoundException("Bank transaction not found");

    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: input.invoiceId, companyId } });
      if (!invoice) throw new BadRequestException("Invoice does not belong to this company");
    }
    if (input.expenseId) {
      const expense = await this.prisma.expense.findFirst({ where: { id: input.expenseId, companyId } });
      if (!expense) throw new BadRequestException("Expense does not belong to this company");
    }

    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: {
        matchedInvoiceId: input.invoiceId ?? null,
        matchedExpenseId: input.expenseId ?? null,
        reconciled: true,
      },
    });
    this.audit.record(companyId, actor, "bank_transaction.matched", "BankTransaction", id, `Matched bank transaction "${transaction.description}"`);
    return updated;
  }

  async unmatch(companyId: string, actor: AuditActor, id: string) {
    const transaction = await this.prisma.bankTransaction.findFirst({ where: { id, companyId } });
    if (!transaction) throw new NotFoundException("Bank transaction not found");

    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { matchedInvoiceId: null, matchedExpenseId: null, reconciled: false },
    });
    this.audit.record(companyId, actor, "bank_transaction.unmatched", "BankTransaction", id, `Unmatched bank transaction "${transaction.description}"`);
    return updated;
  }
}
