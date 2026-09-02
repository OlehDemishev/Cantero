import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("ExpensesService", () => {
  let service: ExpensesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    expense: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      expense: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    storage = { save: jest.fn(), read: jest.fn() };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(ExpensesService);
  });

  describe("list", () => {
    it("flags an expense far above the company's own category history and excludes itself from the baseline", async () => {
      prisma.expense.findMany
        .mockResolvedValueOnce([{ id: "exp-1", category: "fuel", amount: "1000" }])
        .mockResolvedValueOnce([
          { id: "exp-1", category: "fuel", amount: "1000" },
          { id: "exp-2", category: "fuel", amount: "100" },
          { id: "exp-3", category: "fuel", amount: "110" },
          { id: "exp-4", category: "fuel", amount: "95" },
        ]);

      const [result] = await service.list(COMPANY_A, {});

      expect(result.anomaly.isAnomaly).toBe(true);
      expect(result.anomaly.historicalSampleSize).toBe(3);
    });

    it("does not flag anything when the category has too little history", async () => {
      prisma.expense.findMany
        .mockResolvedValueOnce([{ id: "exp-1", category: "other", amount: "500" }])
        .mockResolvedValueOnce([{ id: "exp-1", category: "other", amount: "500" }]);

      const [result] = await service.list(COMPANY_A, {});

      expect(result.anomaly).toEqual({ isAnomaly: false, historicalAverage: null, historicalSampleSize: 0, deviationPercent: null });
    });
  });

  describe("create", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { projectId: "p1", workerId: "w1", category: "fuel", amount: 50, incurredAt: new Date().toISOString() }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it("rejects when the worker does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { projectId: "p1", workerId: "w1", category: "fuel", amount: 50, incurredAt: new Date().toISOString() }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a pending expense once project and worker are confirmed", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      prisma.worker.findFirst.mockResolvedValue({ id: "w1" });
      prisma.expense.create.mockResolvedValue({ id: "exp-1", status: "pending" });

      const result = await service.create(COMPANY_A, {
        projectId: "p1",
        workerId: "w1",
        category: "materials",
        amount: 123.45,
        incurredAt: "2026-01-01T00:00:00.000Z",
      });

      expect(result.status).toBe("pending");
      expect(prisma.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, category: "materials", amount: 123.45 }) }),
      );
    });
  });

  describe("approve / reject", () => {
    it("throws when approving an expense that isn't pending", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "approved", amount: "10" });

      await expect(service.approve(COMPANY_A, ACTOR, "exp-1")).rejects.toThrow(BadRequestException);
    });

    it("approves a pending expense, audits it, and fires the webhook", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "pending", amount: "42.00" });
      prisma.expense.update.mockResolvedValue({ id: "exp-1", status: "approved" });

      await service.approve(COMPANY_A, ACTOR, "exp-1");

      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: "exp-1" },
        data: { status: "approved", approvedByUserId: "user-1", approvedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalled();
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "expense.approved", { expenseId: "exp-1", amount: "42.00" });
    });

    it("rejects a pending expense with a reason", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "pending", amount: "10" });
      prisma.expense.update.mockResolvedValue({ id: "exp-1", status: "rejected" });

      await service.reject(COMPANY_A, ACTOR, "exp-1", "Missing receipt");

      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: "exp-1" },
        data: { status: "rejected", rejectedReason: "Missing receipt" },
      });
    });

    it("throws when rejecting an already-rejected expense", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "rejected", amount: "10" });

      await expect(service.reject(COMPANY_A, ACTOR, "exp-1", "again")).rejects.toThrow(BadRequestException);
    });
  });

  describe("receipt", () => {
    it("throws when downloading a receipt that was never uploaded", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", receiptStorageKey: null });

      await expect(service.downloadReceipt(COMPANY_A, "exp-1")).rejects.toThrow(NotFoundException);
    });

    it("stores the uploaded receipt and records it on the expense", async () => {
      prisma.expense.findFirst.mockResolvedValue({ id: "exp-1" });
      storage.save.mockResolvedValue({ storageKey: "company-a/x-receipt.jpg", size: 100 });
      prisma.expense.update.mockResolvedValue({ id: "exp-1", receiptStorageKey: "company-a/x-receipt.jpg" });

      await service.uploadReceipt(COMPANY_A, "exp-1", { originalname: "receipt.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x") });

      expect(prisma.expense.update).toHaveBeenCalledWith({
        where: { id: "exp-1" },
        data: { receiptStorageKey: "company-a/x-receipt.jpg", receiptMimeType: "image/jpeg" },
      });
    });
  });
});
