import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SuretyBondsService } from "./surety-bonds.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("SuretyBondsService", () => {
  let service: SuretyBondsService;
  let prisma: {
    suretyBond: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    project: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      suretyBond: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        SuretyBondsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(SuretyBondsService);
  });

  describe("create()", () => {
    it("rejects a bond for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          projectId: "proj-1",
          type: "performance",
          suretyName: "Great American",
          penalSum: 100000,
          issueDate: new Date().toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a company-wide bond when no projectId is given", async () => {
      prisma.suretyBond.create.mockResolvedValue({ id: "bond-1", type: "bid", penalSum: 50000 });

      const result = await service.create(COMPANY_A, { name: "Owner" }, {
        type: "bid",
        suretyName: "Great American",
        penalSum: 50000,
        issueDate: new Date().toISOString(),
      });

      expect(result.id).toBe("bond-1");
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("release()", () => {
    it("rejects releasing a bond that isn't active", async () => {
      prisma.suretyBond.findFirst.mockResolvedValue({ id: "bond-1", status: "released", suretyName: "Great American" });

      await expect(service.release(COMPANY_A, { name: "Owner" }, "bond-1")).rejects.toThrow(BadRequestException);
    });

    it("releases an active bond", async () => {
      prisma.suretyBond.findFirst.mockResolvedValue({ id: "bond-1", status: "active", suretyName: "Great American" });
      prisma.suretyBond.update.mockResolvedValue({ id: "bond-1", status: "released" });

      const result = await service.release(COMPANY_A, { name: "Owner" }, "bond-1");

      expect(result.status).toBe("released");
    });
  });

  describe("capacityUtilization()", () => {
    it("returns null available/utilization when no limit has been set", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ bondingCapacityLimit: null });
      prisma.suretyBond.findMany.mockResolvedValue([{ penalSum: 50000 }]);

      const result = await service.capacityUtilization(COMPANY_A);

      expect(result.limit).toBeNull();
      expect(result.used).toBe(50000);
      expect(result.available).toBeNull();
      expect(result.utilizationPercent).toBeNull();
    });

    it("computes used, available, and utilization percent against a set limit", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ bondingCapacityLimit: 200000 });
      prisma.suretyBond.findMany.mockResolvedValue([{ penalSum: 50000 }, { penalSum: 50000 }]);

      const result = await service.capacityUtilization(COMPANY_A);

      expect(result.used).toBe(100000);
      expect(result.available).toBe(100000);
      expect(result.utilizationPercent).toBe(50);
    });

    it("only counts active bonds toward used capacity", async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ bondingCapacityLimit: 200000 });
      prisma.suretyBond.findMany.mockResolvedValue([{ penalSum: 30000 }]);

      const result = await service.capacityUtilization(COMPANY_A);

      expect(prisma.suretyBond.findMany).toHaveBeenCalledWith({ where: { companyId: COMPANY_A, status: "active" }, select: { penalSum: true } });
      expect(result.used).toBe(30000);
    });
  });
});
