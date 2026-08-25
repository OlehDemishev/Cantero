import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InsightsService } from "./insights.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { BudgetService } from "../finance/budget.service";

const COMPANY_A = "company-a";

describe("InsightsService", () => {
  let service: InsightsService;
  let prisma: {
    rfi: { findMany: jest.Mock; count: jest.Mock };
    punchListItem: { findMany: jest.Mock; count: jest.Mock };
    project: { findFirst: jest.Mock };
  };
  let budget: { getForProject: jest.Mock };

  beforeEach(async () => {
    prisma = {
      rfi: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      punchListItem: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      project: { findFirst: jest.fn() },
    };
    budget = { getForProject: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [InsightsService, { provide: PrismaService, useValue: prisma }, { provide: BudgetService, useValue: budget }],
    }).compile();

    service = module.get(InsightsService);
  });

  describe("triage", () => {
    it("ranks a high-priority, past-due, cost-impacting RFI above a fresh low-priority one", async () => {
      const now = Date.now();
      prisma.rfi.findMany.mockResolvedValue([
        {
          id: "rfi-urgent",
          number: "RFI-001",
          subject: "Foundation spec",
          priority: "high",
          dueDate: new Date(now - 86_400_000),
          costImpact: true,
          scheduleImpactDays: 5,
          createdAt: new Date(now - 3 * 86_400_000),
          project: { id: "p1", name: "Site A" },
        },
        {
          id: "rfi-mild",
          number: "RFI-002",
          subject: "Paint color",
          priority: "low",
          dueDate: null,
          costImpact: false,
          scheduleImpactDays: null,
          createdAt: new Date(now - 86_400_000),
          project: { id: "p1", name: "Site A" },
        },
      ]);

      const result = await service.triage(COMPANY_A);

      expect(result[0].id).toBe("rfi-urgent");
      expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it("gives escalated punch list items a higher score than non-escalated ones of similar age", async () => {
      const now = Date.now();
      prisma.punchListItem.findMany.mockResolvedValue([
        { id: "p-escalated", title: "Cracked tile", dueDate: null, escalatedAt: new Date(), createdAt: new Date(now - 86_400_000), project: { id: "p1", name: "Site A" } },
        { id: "p-normal", title: "Touch up paint", dueDate: null, escalatedAt: null, createdAt: new Date(now - 86_400_000), project: { id: "p1", name: "Site A" } },
      ]);

      const result = await service.triage(COMPANY_A);

      const escalated = result.find((r) => r.id === "p-escalated")!;
      const normal = result.find((r) => r.id === "p-normal")!;
      expect(escalated.score).toBeGreaterThan(normal.score);
    });

    it("caps the result at the requested limit", async () => {
      const now = Date.now();
      prisma.rfi.findMany.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => ({
          id: `rfi-${i}`,
          number: `RFI-${i}`,
          subject: "x",
          priority: "medium",
          dueDate: null,
          costImpact: false,
          scheduleImpactDays: null,
          createdAt: new Date(now),
          project: { id: "p1", name: "Site A" },
        })),
      );

      const result = await service.triage(COMPANY_A, 10);
      expect(result).toHaveLength(10);
    });
  });

  describe("projectHealth", () => {
    it("throws when the project doesn't exist in this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.projectHealth(COMPANY_A, "p1")).rejects.toThrow(NotFoundException);
    });

    it("scores a clean project as 'good' with no penalty factors", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      budget.getForProject.mockResolvedValue({
        grandTotalBudget: 1000,
        materialsCostActual: 100,
        laborCostActual: 100,
        subcontractorCostActual: 0,
      });

      const result = await service.projectHealth(COMPANY_A, "p1");

      expect(result.band).toBe("good");
      expect(result.score).toBe(100);
      expect(result.factors).toEqual([]);
    });

    it("penalizes an over-budget project into 'at_risk'", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      budget.getForProject.mockResolvedValue({
        grandTotalBudget: 1000,
        materialsCostActual: 800,
        laborCostActual: 400,
        subcontractorCostActual: 0,
      });
      prisma.rfi.count.mockResolvedValue(5);
      prisma.punchListItem.count.mockResolvedValue(5);

      const result = await service.projectHealth(COMPANY_A, "p1");

      expect(result.score).toBeLessThan(50);
      expect(result.band).toBe("at_risk");
      expect(result.factors.length).toBeGreaterThan(0);
    });
  });
});
