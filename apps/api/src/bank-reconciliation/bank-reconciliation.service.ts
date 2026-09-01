import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBankTransactionRuleInput, ExpenseCategory, ImportResult, MatchBankTransactionInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { categorizeDescription } from "./categorize-transaction";

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

    if (toCreate.length > 0) await this.applyRules(companyId);
    return result;
  }

  listRules(companyId: string) {
    return this.prisma.bankTransactionRule.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  }

  async createRule(companyId: string, actor: AuditActor, input: CreateBankTransactionRuleInput) {
    const rule = await this.prisma.bankTransactionRule.create({ data: { companyId, ...input } });
    this.audit.record(
      companyId,
      actor,
      "bank_transaction_rule.created",
      "BankTransactionRule",
      rule.id,
      `Added a rule: "${input.pattern}" → ${input.category}`,
    );
    return rule;
  }

  async deleteRule(companyId: string, actor: AuditActor, id: string) {
    const rule = await this.prisma.bankTransactionRule.findFirst({ where: { id, companyId } });
    if (!rule) throw new NotFoundException("Rule not found");
    await this.prisma.bankTransactionRule.delete({ where: { id } });
    this.audit.record(companyId, actor, "bank_transaction_rule.deleted", "BankTransactionRule", id, `Removed rule: "${rule.pattern}"`);
    return { ok: true };
  }

  /** Categorizes every transaction that doesn't have a category yet — never overwrites a category
   * someone already set (by a rule or by hand), and never touches matchedInvoiceId/reconciled.
   * Runs automatically right after a CSV import, and on demand (e.g. after adding a new rule, to
   * sweep it across transactions imported before the rule existed). */
  async applyRules(companyId: string): Promise<{ categorized: number }> {
    const [rules, transactions] = await Promise.all([
      this.prisma.bankTransactionRule.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
      this.prisma.bankTransaction.findMany({ where: { companyId, category: null } }),
    ]);
    if (rules.length === 0 || transactions.length === 0) return { categorized: 0 };

    const updates = transactions
      .map((tx) => ({ tx, match: categorizeDescription(tx.description, rules) }))
      .filter((r): r is { tx: (typeof transactions)[number]; match: NonNullable<typeof r.match> } => !!r.match);

    await Promise.all(
      updates.map(({ tx, match }) => this.prisma.bankTransaction.update({ where: { id: tx.id }, data: { category: match.category } })),
    );
    return { categorized: updates.length };
  }

  /**
   * Candidate invoice/expense matches for every unreconciled transaction, ranked by amount and
   * date closeness — a suggestion, never an auto-commit. The human still clicks match(); this
   * only saves them from scanning every open invoice/expense by hand. Money-in transactions
   * (positive amount) only ever suggest invoices; money-out (negative) only ever suggest
   * expenses — a bank statement doesn't mix the two directions on one row.
   */
  async suggestMatches(companyId: string) {
    const [unreconciled, matchedTransactions, invoices, expenses] = await Promise.all([
      this.prisma.bankTransaction.findMany({ where: { companyId, reconciled: false }, orderBy: { date: "desc" } }),
      this.prisma.bankTransaction.findMany({
        where: { companyId, reconciled: true },
        select: { matchedInvoiceId: true, matchedExpenseId: true },
      }),
      this.prisma.invoice.findMany({
        where: { companyId, status: { in: ["sent", "paid"] } },
        select: { id: true, number: true, total: true, dueDate: true, createdAt: true },
      }),
      this.prisma.expense.findMany({
        where: { companyId },
        select: { id: true, description: true, amount: true, incurredAt: true },
      }),
    ]);

    const matchedInvoiceIds = new Set(matchedTransactions.map((t) => t.matchedInvoiceId).filter((v): v is string => !!v));
    const matchedExpenseIds = new Set(matchedTransactions.map((t) => t.matchedExpenseId).filter((v): v is string => !!v));
    const availableInvoices = invoices.filter((i) => !matchedInvoiceIds.has(i.id));
    const availableExpenses = expenses.filter((e) => !matchedExpenseIds.has(e.id));

    return unreconciled.map((tx) => {
      const txAmount = Number(tx.amount);
      const pool =
        txAmount >= 0
          ? availableInvoices.map((i) => ({
              type: "invoice" as const,
              id: i.id,
              label: i.number,
              amount: Number(i.total),
              date: i.dueDate ?? i.createdAt,
            }))
          : availableExpenses.map((e) => ({
              type: "expense" as const,
              id: e.id,
              label: e.description ?? "—",
              amount: Number(e.amount),
              date: e.incurredAt,
            }));

      const candidates = pool
        .map((c) => {
          const amountDiff = Math.abs(Math.abs(txAmount) - c.amount);
          const daysApart = Math.round(Math.abs(tx.date.getTime() - c.date.getTime()) / 86_400_000);
          return { ...c, amountDiff, daysApart, exact: amountDiff < 0.01 };
        })
        .filter((c) => c.daysApart <= 30 && c.amountDiff <= Math.max(1, c.amount * 0.02))
        .sort((a, b) => (a.exact === b.exact ? a.daysApart - b.daysApart : a.exact ? -1 : 1))
        .slice(0, 3)
        .map(({ amountDiff: _amountDiff, ...c }) => c);

      return { transactionId: tx.id, date: tx.date, description: tx.description, amount: txAmount, candidates };
    });
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

  async setCategory(companyId: string, actor: AuditActor, id: string, category: ExpenseCategory | null) {
    const transaction = await this.prisma.bankTransaction.findFirst({ where: { id, companyId } });
    if (!transaction) throw new NotFoundException("Bank transaction not found");
    const updated = await this.prisma.bankTransaction.update({ where: { id }, data: { category } });
    this.audit.record(
      companyId,
      actor,
      "bank_transaction.categorized",
      "BankTransaction",
      id,
      category ? `Categorized "${transaction.description}" as ${category}` : `Cleared category on "${transaction.description}"`,
    );
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
