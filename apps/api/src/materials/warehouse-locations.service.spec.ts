import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WarehouseLocationsService } from "./warehouse-locations.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("WarehouseLocationsService.create", () => {
  let service: WarehouseLocationsService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    warehouseLocation: { findFirst: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn() },
      warehouseLocation: { findFirst: jest.fn(), create: jest.fn((args) => args) },
    };
    const module = await Test.createTestingModule({
      providers: [WarehouseLocationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WarehouseLocationsService);
  });

  it("throws when the warehouse doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.create(COMPANY_A, { warehouseId: "wh-1", kind: "zone", code: "A" })).rejects.toThrow(NotFoundException);
  });

  it("throws when the given parent doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.warehouseLocation.findFirst.mockResolvedValue(null);
    await expect(
      service.create(COMPANY_A, { warehouseId: "wh-1", parentId: "loc-1", kind: "aisle", code: "1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a parent that belongs to a different warehouse", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.warehouseLocation.findFirst.mockResolvedValue({ id: "loc-1", warehouseId: "wh-2" });
    await expect(
      service.create(COMPANY_A, { warehouseId: "wh-1", parentId: "loc-1", kind: "aisle", code: "1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates a root location with no parent", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    await service.create(COMPANY_A, { warehouseId: "wh-1", kind: "zone", code: "A" });
    expect(prisma.warehouseLocation.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, warehouseId: "wh-1", parentId: undefined, kind: "zone", code: "A" },
    });
  });

  it("creates a child location under a same-warehouse parent", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.warehouseLocation.findFirst.mockResolvedValue({ id: "loc-1", warehouseId: "wh-1" });
    await service.create(COMPANY_A, { warehouseId: "wh-1", parentId: "loc-1", kind: "aisle", code: "1" });
    expect(prisma.warehouseLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: "loc-1" }) }),
    );
  });
});

describe("WarehouseLocationsService.delete", () => {
  let service: WarehouseLocationsService;
  let prisma: {
    warehouseLocation: { findFirst: jest.Mock; count: jest.Mock; delete: jest.Mock };
    stockLevel: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      warehouseLocation: { findFirst: jest.fn().mockResolvedValue({ id: "loc-1" }), count: jest.fn(), delete: jest.fn() },
      stockLevel: { count: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [WarehouseLocationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WarehouseLocationsService);
  });

  it("throws when the location doesn't belong to the company", async () => {
    prisma.warehouseLocation.findFirst.mockResolvedValue(null);
    await expect(service.delete(COMPANY_A, "loc-1")).rejects.toThrow(NotFoundException);
  });

  it("refuses to delete a location with children", async () => {
    prisma.warehouseLocation.count.mockResolvedValue(1);
    prisma.stockLevel.count.mockResolvedValue(0);
    await expect(service.delete(COMPANY_A, "loc-1")).rejects.toThrow(BadRequestException);
    expect(prisma.warehouseLocation.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a location still referenced by a StockLevel", async () => {
    prisma.warehouseLocation.count.mockResolvedValue(0);
    prisma.stockLevel.count.mockResolvedValue(1);
    await expect(service.delete(COMPANY_A, "loc-1")).rejects.toThrow(BadRequestException);
  });

  it("deletes an unreferenced leaf location", async () => {
    prisma.warehouseLocation.count.mockResolvedValue(0);
    prisma.stockLevel.count.mockResolvedValue(0);
    await service.delete(COMPANY_A, "loc-1");
    expect(prisma.warehouseLocation.delete).toHaveBeenCalledWith({ where: { id: "loc-1" } });
  });
});
