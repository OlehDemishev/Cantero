import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StockReservationsService } from "./stock-reservations.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("StockReservationsService.create", () => {
  let service: StockReservationsService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    stockReservation: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn() },
      materialCatalogItem: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      stockReservation: { create: jest.fn((args) => args) },
    };

    const module = await Test.createTestingModule({
      providers: [StockReservationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StockReservationsService);
  });

  it("throws when the warehouse doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(
      service.create(COMPANY_A, "Alice", { warehouseId: "wh-1", materialCatalogItemId: "mat-1", quantity: 5 }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.stockReservation.create).not.toHaveBeenCalled();
  });

  it("throws when the material doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.materialCatalogItem.findFirst.mockResolvedValue(null);
    await expect(
      service.create(COMPANY_A, "Alice", { warehouseId: "wh-1", materialCatalogItemId: "mat-1", quantity: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws when the given project doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      service.create(COMPANY_A, "Alice", { warehouseId: "wh-1", materialCatalogItemId: "mat-1", quantity: 5, projectId: "proj-1" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("allows reserving more than is currently on hand — over-reservation is not checked here", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });

    await service.create(COMPANY_A, "Alice", { warehouseId: "wh-1", materialCatalogItemId: "mat-1", quantity: 999 });

    expect(prisma.stockReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, quantity: 999, createdByName: "Alice" }) }),
    );
  });
});

describe("StockReservationsService.release", () => {
  let service: StockReservationsService;
  let prisma: { stockReservation: { findFirst: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = { stockReservation: { findFirst: jest.fn(), update: jest.fn((args) => args) } };
    const module = await Test.createTestingModule({
      providers: [StockReservationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StockReservationsService);
  });

  it("throws when the reservation doesn't belong to the company", async () => {
    prisma.stockReservation.findFirst.mockResolvedValue(null);
    await expect(service.release(COMPANY_A, "res-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects releasing an already-released reservation", async () => {
    prisma.stockReservation.findFirst.mockResolvedValue({ id: "res-1", status: "released" });
    await expect(service.release(COMPANY_A, "res-1")).rejects.toThrow(BadRequestException);
    expect(prisma.stockReservation.update).not.toHaveBeenCalled();
  });

  it("marks an active reservation released", async () => {
    prisma.stockReservation.findFirst.mockResolvedValue({ id: "res-1", status: "active" });

    await service.release(COMPANY_A, "res-1");

    expect(prisma.stockReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "res-1" }, data: expect.objectContaining({ status: "released" }) }),
    );
  });
});
