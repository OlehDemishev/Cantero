import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ProductivityService } from "./productivity.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ProductivityService", () => {
  let service: ProductivityService;
  let prisma: {
    project: { findFirst: jest.Mock };
    costCode: { findFirst: jest.Mock };
    productivityLog: { findMany: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      costCode: { findFirst: jest.fn() },
      productivityLog: { findMany: jest.fn(), create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ProductivityService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(ProductivityService);
  });

  describe("log()", () => {
    it("rejects a log for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.log(COMPANY_A, ACTOR, "project-1", {
          workDate: new Date().toISOString(),
          quantityCompleted: 100,
          unit: "sf",
          laborHours: 8,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a log referencing a cost code from another company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.costCode.findFirst.mockResolvedValue(null);
      await expect(
        service.log(COMPANY_A, ACTOR, "project-1", {
          costCodeId: "cc-1",
          workDate: new Date().toISOString(),
          quantityCompleted: 100,
          unit: "sf",
          laborHours: 8,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a log and audits it", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.productivityLog.create.mockResolvedValue({ id: "log-1" });

      await service.log(COMPANY_A, ACTOR, "project-1", {
        workDate: new Date().toISOString(),
        quantityCompleted: 100,
        unit: "sf",
        laborHours: 8,
      });

      expect(prisma.productivityLog.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "productivity_log.created", "ProductivityLog", "log-1", expect.any(String));
    });
  });

  describe("rateByCostCode()", () => {
    it("throws when the cost code doesn't belong to the company", async () => {
      prisma.costCode.findFirst.mockResolvedValue(null);
      await expect(service.rateByCostCode(COMPANY_A, "cc-1")).rejects.toThrow(NotFoundException);
    });

    it("rolls up logs into a productivity rate", async () => {
      prisma.costCode.findFirst.mockResolvedValue({ id: "cc-1" });
      prisma.productivityLog.findMany.mockResolvedValue([
        { quantityCompleted: "100", laborHours: "8" },
        { quantityCompleted: "50", laborHours: "4" },
      ]);

      const result = await service.rateByCostCode(COMPANY_A, "cc-1");

      expect(result.totalQuantityCompleted).toBe(150);
      expect(result.hoursPerUnit).toBe(0.08);
    });
  });

  describe("crewScorecard()", () => {
    it("groups by crew, then by unit within each crew", async () => {
      prisma.productivityLog.findMany.mockResolvedValue([
        { crewName: "Crew A", projectId: "p1", unit: "sf", quantityCompleted: "100", laborHours: "8" },
        { crewName: "Crew A", projectId: "p2", unit: "sf", quantityCompleted: "50", laborHours: "4" },
        { crewName: "Crew A", projectId: "p1", unit: "cy", quantityCompleted: "10", laborHours: "5" },
        { crewName: "Crew B", projectId: "p1", unit: "sf", quantityCompleted: "20", laborHours: "2" },
        { crewName: null, projectId: "p1", unit: "sf", quantityCompleted: "5", laborHours: "1" },
      ]);

      const result = await service.crewScorecard(COMPANY_A);

      const crewA = result.find((r) => r.crewName === "Crew A")!;
      expect(crewA.projectCount).toBe(2);
      expect(crewA.byUnit.find((u) => u.unit === "sf")!.totalQuantityCompleted).toBe(150);
      expect(crewA.byUnit.find((u) => u.unit === "cy")!.totalQuantityCompleted).toBe(10);

      const unassigned = result.find((r) => r.crewName === null);
      expect(unassigned).toBeDefined();
    });
  });
});
