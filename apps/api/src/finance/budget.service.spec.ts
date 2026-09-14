import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { BudgetService } from "./budget.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "Anke Müller" };

describe("BudgetService", () => {
  let service: BudgetService;
  let prisma: {
    project: { findFirst: jest.Mock };
    estimate: { findMany: jest.Mock };
    budgetRevision: { findMany: jest.Mock; create: jest.Mock };
    contingencyDraw: { findMany: jest.Mock; create: jest.Mock };
    stockMovement: { findMany: jest.Mock };
    timeEntry: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      estimate: { findMany: jest.fn().mockResolvedValue([]) },
      budgetRevision: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      contingencyDraw: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([]) },
      // addContingencyDraw wraps its read-check-write in a serializable transaction (see
      // budget.service.ts) — the mock just runs the callback against this same prisma double,
      // since these unit tests aren't exercising real transactional isolation.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [BudgetService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(BudgetService);
  });

  describe("getForProject", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.getForProject(COMPANY_A, PROJECT_A)).rejects.toThrow(NotFoundException);
    });

    it("folds budget revisions into the revised budget total", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, contingencyAmount: null });
      prisma.estimate.findMany.mockResolvedValue([{ materialsCostTotal: "1000", laborCostTotal: "500", grandTotal: "1650" }]);
      prisma.budgetRevision.findMany.mockResolvedValue([
        { id: "rev-1", amount: "500", reason: "Unforeseen site conditions", createdByName: "Anke", createdAt: new Date() },
        { id: "rev-2", amount: "-100", reason: "Scope trimmed", createdByName: "Anke", createdAt: new Date() },
      ]);

      const result = await service.getForProject(COMPANY_A, PROJECT_A);

      expect(result.grandTotalBudget).toBe(1650);
      expect(result.budgetRevisionsTotal).toBe(400);
      expect(result.revisedBudgetTotal).toBe(2050);
      expect(result.revisions).toHaveLength(2);
    });

    it("costs consumed materials at the movement's own recorded unitCost, not today's live catalog price", async () => {
      // Issued a year ago at $8/unit under FIFO; the catalog price has since risen to $20. The
      // budget-vs-actual report must reflect what was actually charged at the time, not retroactively
      // reprice history every time the catalog changes — same convention as the labor snapshot below.
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, contingencyAmount: null });
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: "10", unitCost: "8.00", materialCatalogItem: { defaultUnitPrice: "20.00" } },
      ]);

      const result = await service.getForProject(COMPANY_A, PROJECT_A);

      expect(result.materialsCostActual).toBe(80);
    });

    it("falls back to the catalog's current price only when a movement has no recorded unitCost at all", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, contingencyAmount: null });
      prisma.stockMovement.findMany.mockResolvedValue([
        { quantity: "10", unitCost: null, materialCatalogItem: { defaultUnitPrice: "20.00" } },
      ]);

      const result = await service.getForProject(COMPANY_A, PROJECT_A);

      expect(result.materialsCostActual).toBe(200);
    });

    it("returns null contingency fields when the project has no reserve set", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, contingencyAmount: null });

      const result = await service.getForProject(COMPANY_A, PROJECT_A);

      expect(result.contingencyAmount).toBeNull();
      expect(result.contingencyRemaining).toBeNull();
      expect(result.contingencyDrawnTotal).toBe(0);
    });

    it("computes contingency remaining as the reserve minus drawn total", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, contingencyAmount: "10000" });
      prisma.contingencyDraw.findMany.mockResolvedValue([
        { id: "draw-1", amount: "1500", reason: "Weather delay cleanup", createdByName: "Anke", createdAt: new Date() },
        { id: "draw-2", amount: "500", reason: "Extra permit fee", createdByName: "Anke", createdAt: new Date() },
      ]);

      const result = await service.getForProject(COMPANY_A, PROJECT_A);

      expect(result.contingencyAmount).toBe(10000);
      expect(result.contingencyDrawnTotal).toBe(2000);
      expect(result.contingencyRemaining).toBe(8000);
      expect(result.contingencyDraws).toHaveLength(2);
    });
  });

  describe("addContingencyDraw", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when the project has no contingency reserve set", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Hotel Renovation", contingencyAmount: null });
      await expect(
        service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.contingencyDraw.create).not.toHaveBeenCalled();
    });

    it("throws when the draw would exceed the remaining reserve", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Hotel Renovation", contingencyAmount: "1000" });
      prisma.contingencyDraw.findMany.mockResolvedValue([{ amount: "800" }]);

      await expect(
        service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.contingencyDraw.create).not.toHaveBeenCalled();
    });

    it("creates the draw and audits it when within the remaining reserve", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Hotel Renovation", contingencyAmount: "1000" });
      prisma.contingencyDraw.findMany.mockResolvedValue([{ amount: "300" }]);
      prisma.contingencyDraw.create.mockResolvedValue({ id: "draw-1" });

      await service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" });

      expect(prisma.contingencyDraw.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_A,
          projectId: PROJECT_A,
          amount: 500,
          reason: "Weather delay",
          createdByUserId: "user-1",
          createdByName: "Anke Müller",
        },
      });
      expect(audit.record).toHaveBeenCalled();
    });

    it("retries once on a serializable-transaction write conflict, then succeeds", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Hotel Renovation", contingencyAmount: "1000" });
      prisma.contingencyDraw.findMany.mockResolvedValue([{ amount: "300" }]);
      prisma.contingencyDraw.create.mockResolvedValue({ id: "draw-1" });
      const conflict = new Prisma.PrismaClientKnownRequestError("Transaction write conflict", { code: "P2034", clientVersion: "test" });
      prisma.$transaction.mockImplementationOnce(() => Promise.reject(conflict)).mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(prisma));

      await service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" });

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.contingencyDraw.create).toHaveBeenCalledTimes(1);
    });

    it("does not retry and rethrows a non-conflict error", async () => {
      const boom = new Error("boom");
      prisma.$transaction.mockRejectedValue(boom);

      await expect(
        service.addContingencyDraw(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Weather delay" }),
      ).rejects.toBe(boom);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("addRevision", () => {
    it("throws when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.addRevision(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Site conditions" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.budgetRevision.create).not.toHaveBeenCalled();
    });

    it("creates the revision scoped to this company and audits it", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Hotel Renovation" });
      prisma.budgetRevision.create.mockResolvedValue({ id: "rev-1" });

      await service.addRevision(COMPANY_A, ACTOR, { projectId: PROJECT_A, amount: 500, reason: "Unforeseen site conditions" });

      expect(prisma.budgetRevision.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_A,
          projectId: PROJECT_A,
          amount: 500,
          reason: "Unforeseen site conditions",
          createdByUserId: "user-1",
          createdByName: "Anke Müller",
        },
      });
      expect(audit.record).toHaveBeenCalled();
    });
  });
});
