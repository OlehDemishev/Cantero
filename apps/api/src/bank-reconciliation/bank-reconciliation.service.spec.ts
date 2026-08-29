import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BankReconciliationService } from "./bank-reconciliation.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Accountant" };

describe("BankReconciliationService", () => {
  let service: BankReconciliationService;
  let prisma: {
    bankTransaction: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; createMany: jest.Mock };
    invoice: { findFirst: jest.Mock; findMany: jest.Mock };
    expense: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      bankTransaction: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), createMany: jest.fn() },
      invoice: { findFirst: jest.fn(), findMany: jest.fn() },
      expense: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [BankReconciliationService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(BankReconciliationService);
  });

  describe("importCsv", () => {
    it("skips a row with an invalid date and records the error", async () => {
      const csv = "date,description,amount\nnot-a-date,Deposit,100\n";

      const result = await service.importCsv(COMPANY_A, ACTOR, csv);

      expect(result).toEqual({ created: 0, skipped: 1, errors: [{ row: 2, message: "Missing or invalid date" }] });
      expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
    });

    it("skips a row with a non-numeric amount", async () => {
      const csv = "date,description,amount\n2026-06-01,Deposit,not-a-number\n";

      const result = await service.importCsv(COMPANY_A, ACTOR, csv);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].message).toBe("Missing or invalid amount");
    });

    it("imports valid rows, defaulting a blank description", async () => {
      const csv = "date,description,amount\n2026-06-01,Client payment,500\n2026-06-02,,-25.50\n";

      const result = await service.importCsv(COMPANY_A, ACTOR, csv);

      expect(result.created).toBe(2);
      expect(prisma.bankTransaction.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ companyId: COMPANY_A, description: "Client payment", amount: 500 }),
          expect.objectContaining({ companyId: COMPANY_A, description: "—", amount: -25.5 }),
        ],
      });
    });
  });

  describe("suggestMatches", () => {
    it("suggests an invoice for a positive (money-in) transaction with a matching amount", async () => {
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([{ id: "tx-1", date: new Date("2026-06-05"), description: "Deposit", amount: 500 }])
        .mockResolvedValueOnce([]); // already-reconciled transactions
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-001", total: 500, dueDate: new Date("2026-06-03"), createdAt: new Date("2026-05-20") },
      ]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.suggestMatches(COMPANY_A);

      expect(result).toHaveLength(1);
      expect(result[0].candidates).toHaveLength(1);
      expect(result[0].candidates[0]).toMatchObject({ type: "invoice", id: "inv-1", exact: true, daysApart: 2 });
    });

    it("suggests an expense for a negative (money-out) transaction, never an invoice", async () => {
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([{ id: "tx-1", date: new Date("2026-06-05"), description: "Supplier payment", amount: -120 }])
        .mockResolvedValueOnce([]);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-001", total: 120, dueDate: new Date("2026-06-05"), createdAt: new Date("2026-05-20") },
      ]);
      prisma.expense.findMany.mockResolvedValue([{ id: "exp-1", description: "Lumber", amount: 120, incurredAt: new Date("2026-06-04") }]);

      const result = await service.suggestMatches(COMPANY_A);

      expect(result[0].candidates).toHaveLength(1);
      expect(result[0].candidates[0]).toMatchObject({ type: "expense", id: "exp-1" });
    });

    it("excludes an invoice already matched by another reconciled transaction", async () => {
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([{ id: "tx-1", date: new Date("2026-06-05"), description: "Deposit", amount: 500 }])
        .mockResolvedValueOnce([{ matchedInvoiceId: "inv-1", matchedExpenseId: null }]);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-001", total: 500, dueDate: new Date("2026-06-05"), createdAt: new Date("2026-05-20") },
      ]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.suggestMatches(COMPANY_A);

      expect(result[0].candidates).toEqual([]);
    });

    it("excludes a candidate whose amount or date is too far off", async () => {
      prisma.bankTransaction.findMany
        .mockResolvedValueOnce([{ id: "tx-1", date: new Date("2026-06-05"), description: "Deposit", amount: 500 }])
        .mockResolvedValueOnce([]);
      prisma.invoice.findMany.mockResolvedValue([
        { id: "inv-1", number: "INV-001", total: 900, dueDate: new Date("2026-06-05"), createdAt: new Date("2026-05-20") },
        { id: "inv-2", number: "INV-002", total: 500, dueDate: new Date("2026-01-01"), createdAt: new Date("2025-12-01") },
      ]);
      prisma.expense.findMany.mockResolvedValue([]);

      const result = await service.suggestMatches(COMPANY_A);

      expect(result[0].candidates).toEqual([]);
    });
  });

  describe("match", () => {
    it("throws when the transaction doesn't belong to this company", async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);
      await expect(service.match(COMPANY_A, ACTOR, "tx-1", { invoiceId: "inv-1" })).rejects.toThrow(NotFoundException);
    });

    it("rejects an invoice from another company", async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({ id: "tx-1", description: "Deposit" });
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.match(COMPANY_A, ACTOR, "tx-1", { invoiceId: "inv-1" })).rejects.toThrow(BadRequestException);
      expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
    });

    it("marks the transaction reconciled and links the matched invoice", async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({ id: "tx-1", description: "Deposit" });
      prisma.invoice.findFirst.mockResolvedValue({ id: "inv-1" });
      prisma.bankTransaction.update.mockResolvedValue({ id: "tx-1", reconciled: true });

      await service.match(COMPANY_A, ACTOR, "tx-1", { invoiceId: "inv-1" });

      expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
        where: { id: "tx-1" },
        data: { matchedInvoiceId: "inv-1", matchedExpenseId: null, reconciled: true },
      });
    });
  });

  describe("unmatch", () => {
    it("throws when the transaction doesn't belong to this company", async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);
      await expect(service.unmatch(COMPANY_A, ACTOR, "tx-1")).rejects.toThrow(NotFoundException);
    });

    it("clears the match and un-reconciles the transaction", async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue({ id: "tx-1", description: "Deposit" });
      prisma.bankTransaction.update.mockResolvedValue({ id: "tx-1", reconciled: false });

      await service.unmatch(COMPANY_A, ACTOR, "tx-1");

      expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
        where: { id: "tx-1" },
        data: { matchedInvoiceId: null, matchedExpenseId: null, reconciled: false },
      });
    });
  });
});
