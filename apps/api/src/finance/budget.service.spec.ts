import { NotFoundException } from "@nestjs/common";
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
    stockMovement: { findMany: jest.Mock };
    timeEntry: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      estimate: { findMany: jest.fn().mockResolvedValue([]) },
      budgetRevision: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([]) },
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
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A });
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
