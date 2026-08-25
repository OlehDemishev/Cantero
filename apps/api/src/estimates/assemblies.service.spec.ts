import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AssembliesService } from "./assemblies.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("AssembliesService", () => {
  let service: AssembliesService;
  let prisma: {
    rateCatalogItem: { count: jest.Mock };
    assembly: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    assemblyItem: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      rateCatalogItem: { count: jest.fn() },
      assembly: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
      assemblyItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [AssembliesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AssembliesService);
  });

  describe("create", () => {
    it("rejects when a rate item doesn't belong to this company", async () => {
      prisma.rateCatalogItem.count.mockResolvedValue(0);

      await expect(
        service.create(COMPANY_A, {
          code: "BATH-1",
          name: "Bathroom install",
          unit: "ea",
          items: [{ rateCatalogItemId: "item-1", quantityPerUnit: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.assembly.create).not.toHaveBeenCalled();
    });

    it("creates the assembly with its items when all rate items belong to this company", async () => {
      prisma.rateCatalogItem.count.mockResolvedValue(1);
      prisma.assembly.create.mockResolvedValue({ id: "assembly-1" });

      await service.create(COMPANY_A, {
        code: "BATH-1",
        name: "Bathroom install",
        unit: "ea",
        items: [{ rateCatalogItemId: "item-1", quantityPerUnit: 2 }],
      });

      expect(prisma.assembly.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_A, code: "BATH-1" }),
        }),
      );
    });

    it("surfaces a clear error when the code is already taken", async () => {
      prisma.rateCatalogItem.count.mockResolvedValue(1);
      prisma.assembly.create.mockRejectedValue({ code: "P2002" });

      await expect(
        service.create(COMPANY_A, { code: "DUP", name: "x", unit: "ea", items: [{ rateCatalogItemId: "item-1", quantityPerUnit: 1 }] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("get", () => {
    it("throws for an assembly outside this company", async () => {
      prisma.assembly.findFirst.mockResolvedValue(null);
      await expect(service.get(COMPANY_A, "assembly-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete", () => {
    it("throws for an assembly outside this company", async () => {
      prisma.assembly.findFirst.mockResolvedValue(null);
      await expect(service.delete(COMPANY_A, "assembly-1")).rejects.toThrow(NotFoundException);
      expect(prisma.assembly.delete).not.toHaveBeenCalled();
    });
  });
});
