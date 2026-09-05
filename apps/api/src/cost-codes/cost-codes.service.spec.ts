import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CostCodesService } from "./cost-codes.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("CostCodesService", () => {
  let service: CostCodesService;
  let prisma: {
    costCode: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      costCode: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [CostCodesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
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

  describe("importStandardLibrary()", () => {
    it("creates all 16 divisions when the company has none yet", async () => {
      prisma.costCode.findMany.mockResolvedValue([]);
      prisma.costCode.createMany.mockResolvedValue({ count: 16 });

      const result = await service.importStandardLibrary(COMPANY_A, ACTOR);

      expect(result.created).toBe(16);
      expect(result.skipped).toBe(0);
      const createManyCall = prisma.costCode.createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(16);
      expect(createManyCall.data[0]).toEqual({ companyId: COMPANY_A, code: "01 00 00", name: "General Requirements" });
    });

    it("skips divisions the company already has", async () => {
      prisma.costCode.findMany.mockResolvedValue([{ code: "01 00 00" }, { code: "03 00 00" }]);
      prisma.costCode.createMany.mockResolvedValue({ count: 14 });

      const result = await service.importStandardLibrary(COMPANY_A, ACTOR);

      expect(result.created).toBe(14);
      expect(result.skipped).toBe(2);
      const createManyCall = prisma.costCode.createMany.mock.calls[0][0];
      expect(createManyCall.data.some((d: { code: string }) => d.code === "01 00 00")).toBe(false);
      expect(createManyCall.data.some((d: { code: string }) => d.code === "03 00 00")).toBe(false);
    });

    it("does not call createMany when every division already exists", async () => {
      prisma.costCode.findMany.mockResolvedValue(
        ["01 00 00", "02 00 00", "03 00 00", "04 00 00", "05 00 00", "06 00 00", "07 00 00", "08 00 00", "09 00 00", "10 00 00", "21 00 00", "22 00 00", "23 00 00", "26 00 00", "31 00 00", "32 00 00"].map(
          (code) => ({ code }),
        ),
      );

      const result = await service.importStandardLibrary(COMPANY_A, ACTOR);

      expect(result.created).toBe(0);
      expect(prisma.costCode.createMany).not.toHaveBeenCalled();
    });
  });
});
