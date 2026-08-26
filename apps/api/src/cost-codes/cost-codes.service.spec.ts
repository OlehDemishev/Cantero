import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CostCodesService } from "./cost-codes.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("CostCodesService", () => {
  let service: CostCodesService;
  let prisma: {
    costCode: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      costCode: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [CostCodesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CostCodesService);
  });

  describe("create()", () => {
    it("rejects a duplicate code within the same company", async () => {
      prisma.costCode.findUnique.mockResolvedValue({ id: "existing" });

      await expect(service.create(COMPANY_A, { code: "03 00 00", name: "Concrete" })).rejects.toThrow(BadRequestException);
      expect(prisma.costCode.create).not.toHaveBeenCalled();
    });

    it("creates the cost code scoped to the company", async () => {
      prisma.costCode.findUnique.mockResolvedValue(null);
      prisma.costCode.create.mockResolvedValue({ id: "cc-1", companyId: COMPANY_A, code: "03 00 00", name: "Concrete" });

      await service.create(COMPANY_A, { code: "03 00 00", name: "Concrete" });

      expect(prisma.costCode.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, code: "03 00 00", name: "Concrete" },
      });
    });
  });

  describe("update()/delete()", () => {
    it("throws when the cost code doesn't belong to this company", async () => {
      prisma.costCode.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, "cc-1", { name: "New name" })).rejects.toThrow(NotFoundException);
      await expect(service.delete(COMPANY_A, "cc-1")).rejects.toThrow(NotFoundException);
      expect(prisma.costCode.update).not.toHaveBeenCalled();
      expect(prisma.costCode.delete).not.toHaveBeenCalled();
    });

    it("updates and deletes when it belongs to the company", async () => {
      prisma.costCode.findFirst.mockResolvedValue({ id: "cc-1", companyId: COMPANY_A });
      prisma.costCode.update.mockResolvedValue({ id: "cc-1", name: "New name" });

      await service.update(COMPANY_A, "cc-1", { name: "New name" });
      expect(prisma.costCode.update).toHaveBeenCalledWith({ where: { id: "cc-1" }, data: { name: "New name" } });

      await service.delete(COMPANY_A, "cc-1");
      expect(prisma.costCode.delete).toHaveBeenCalledWith({ where: { id: "cc-1" } });
    });
  });
});
