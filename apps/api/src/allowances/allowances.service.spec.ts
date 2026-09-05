import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AllowancesService } from "./allowances.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("AllowancesService", () => {
  let service: AllowancesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    allowance: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock; update: jest.Mock };
    allowanceCharge: { create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      allowance: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      allowanceCharge: { create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [AllowancesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(AllowancesService);
  });

  describe("create()", () => {
    it("rejects an allowance for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, ACTOR, "project-1", { name: "Lighting", budgetedAmount: 5000 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("addCharge()", () => {
    it("throws when the allowance doesn't belong to the company", async () => {
      prisma.allowance.findFirst.mockResolvedValue(null);
      await expect(service.addCharge(COMPANY_A, ACTOR, "allow-1", { description: "Fixture A", amount: 1000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects a charge on a closed allowance", async () => {
      prisma.allowance.findFirst.mockResolvedValue({ id: "allow-1", status: "closed", charges: [] });
      await expect(service.addCharge(COMPANY_A, ACTOR, "allow-1", { description: "Fixture A", amount: 1000 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.allowanceCharge.create).not.toHaveBeenCalled();
    });

    it("keeps status active when total charges stay within budget", async () => {
      prisma.allowance.findFirst.mockResolvedValue({ id: "allow-1", name: "Lighting", status: "active", charges: [] });
      prisma.allowanceCharge.create.mockResolvedValue({ id: "charge-1" });
      prisma.allowance.findUniqueOrThrow.mockResolvedValue({
        id: "allow-1",
        name: "Lighting",
        status: "active",
        budgetedAmount: "5000",
        charges: [{ amount: "3000" }],
      });

      await service.addCharge(COMPANY_A, ACTOR, "allow-1", { description: "Fixture A", amount: 3000 });

      expect(prisma.allowance.update).not.toHaveBeenCalled();
    });

    it("flags exceeded and audits once charges pass the budget", async () => {
      prisma.allowance.findFirst.mockResolvedValue({ id: "allow-1", name: "Lighting", status: "active", charges: [] });
      prisma.allowanceCharge.create.mockResolvedValue({ id: "charge-1" });
      prisma.allowance.findUniqueOrThrow.mockResolvedValue({
        id: "allow-1",
        name: "Lighting",
        status: "active",
        budgetedAmount: "5000",
        charges: [{ amount: "6000" }],
      });

      await service.addCharge(COMPANY_A, ACTOR, "allow-1", { description: "Fixture A", amount: 6000 });

      expect(prisma.allowance.update).toHaveBeenCalledWith({ where: { id: "allow-1" }, data: { status: "exceeded" } });
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "allowance.exceeded", "Allowance", "allow-1", expect.any(String));
    });
  });

  describe("close()", () => {
    it("throws when the allowance doesn't belong to the company", async () => {
      prisma.allowance.findFirst.mockResolvedValue(null);
      await expect(service.close(COMPANY_A, ACTOR, "allow-1")).rejects.toThrow(NotFoundException);
    });

    it("sets status to closed", async () => {
      prisma.allowance.findFirst.mockResolvedValue({ id: "allow-1", name: "Lighting", status: "active", charges: [] });
      prisma.allowance.update.mockResolvedValue({ id: "allow-1", status: "closed" });

      const result = await service.close(COMPANY_A, ACTOR, "allow-1");

      expect(result.status).toBe("closed");
      expect(prisma.allowance.update).toHaveBeenCalledWith({ where: { id: "allow-1" }, data: { status: "closed" } });
    });
  });
});
