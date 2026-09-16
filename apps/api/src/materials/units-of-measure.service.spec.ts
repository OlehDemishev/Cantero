import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UnitsOfMeasureService } from "./units-of-measure.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("UnitsOfMeasureService.create", () => {
  let service: UnitsOfMeasureService;
  let prisma: { unitOfMeasure: { findFirst: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { unitOfMeasure: { findFirst: jest.fn(), create: jest.fn((args) => args) } };
    const module = await Test.createTestingModule({
      providers: [UnitsOfMeasureService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UnitsOfMeasureService);
  });

  it("creates a base unit with no baseUnitId check needed", async () => {
    await service.create(COMPANY_A, { code: "ea", name: "Each" });
    expect(prisma.unitOfMeasure.findFirst).not.toHaveBeenCalled();
    expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, code: "ea", name: "Each" }) }),
    );
  });

  it("throws when the given base unit doesn't belong to the company", async () => {
    prisma.unitOfMeasure.findFirst.mockResolvedValue(null);
    await expect(service.create(COMPANY_A, { code: "box12", name: "Box of 12", baseUnitId: "ea-1", factorToBase: 12 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rejects chaining a derived unit off another derived unit", async () => {
    prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: "box12-1", baseUnitId: "ea-1" });
    await expect(
      service.create(COMPANY_A, { code: "pallet", name: "Pallet", baseUnitId: "box12-1", factorToBase: 10 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates a derived unit off a valid base unit", async () => {
    prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: "ea-1", baseUnitId: null });
    await service.create(COMPANY_A, { code: "box12", name: "Box of 12", baseUnitId: "ea-1", factorToBase: 12 });
    expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ baseUnitId: "ea-1", factorToBase: 12 }) }),
    );
  });
});

describe("UnitsOfMeasureService.delete", () => {
  let service: UnitsOfMeasureService;
  let prisma: {
    unitOfMeasure: { findFirst: jest.Mock; count: jest.Mock; delete: jest.Mock };
    materialCatalogItem: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      unitOfMeasure: { findFirst: jest.fn().mockResolvedValue({ id: "u1" }), count: jest.fn(), delete: jest.fn() },
      materialCatalogItem: { count: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [UnitsOfMeasureService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UnitsOfMeasureService);
  });

  it("throws when the unit doesn't belong to the company", async () => {
    prisma.unitOfMeasure.findFirst.mockResolvedValue(null);
    await expect(service.delete(COMPANY_A, "u1")).rejects.toThrow(NotFoundException);
  });

  it("refuses to delete a unit still used by a material", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(1);
    prisma.unitOfMeasure.count.mockResolvedValue(0);
    await expect(service.delete(COMPANY_A, "u1")).rejects.toThrow(BadRequestException);
    expect(prisma.unitOfMeasure.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a unit that is another unit's base", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(0);
    prisma.unitOfMeasure.count.mockResolvedValue(1);
    await expect(service.delete(COMPANY_A, "u1")).rejects.toThrow(BadRequestException);
  });

  it("deletes an unused, unreferenced unit", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(0);
    prisma.unitOfMeasure.count.mockResolvedValue(0);
    await service.delete(COMPANY_A, "u1");
    expect(prisma.unitOfMeasure.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});
