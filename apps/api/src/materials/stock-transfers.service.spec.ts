import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StockTransfersService } from "./stock-transfers.service";
import { StockService } from "./stock.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("StockTransfersService", () => {
  let service: StockTransfersService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findFirst: jest.Mock };
    stockTransfer: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    stockLevel: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let stockService: { computeSingleWarehouseCosting: jest.Mock };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn() },
      materialCatalogItem: { findFirst: jest.fn() },
      stockTransfer: { create: jest.fn((args) => args), findFirst: jest.fn(), update: jest.fn((args) => args) },
      stockLevel: { upsert: jest.fn((args) => args) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    stockService = { computeSingleWarehouseCosting: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        StockTransfersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stockService },
      ],
    }).compile();

    service = module.get(StockTransfersService);
  });

  describe("initiate()", () => {
    it("rejects when the source warehouse doesn't belong to this company", async () => {
      prisma.warehouse.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.initiate(COMPANY_A, "Jordan", { fromWarehouseId: "wh-1", toWarehouseId: "wh-2", materialCatalogItemId: "mat-1", quantity: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("debits the source warehouse immediately and costs it as an issue", async () => {
      prisma.warehouse.findFirst.mockResolvedValueOnce({ id: "wh-1" }).mockResolvedValueOnce({ id: "wh-2" });
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      stockService.computeSingleWarehouseCosting.mockResolvedValue({ movementUnitCost: 6, averageCostUpdate: null, layerOps: [] });

      await service.initiate(COMPANY_A, "Jordan", { fromWarehouseId: "wh-1", toWarehouseId: "wh-2", materialCatalogItemId: "mat-1", quantity: 5 });

      expect(stockService.computeSingleWarehouseCosting).toHaveBeenCalledWith(COMPANY_A, "wh-1", "mat-1", "issue", 5, undefined);
      expect(prisma.stockTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fromWarehouseId: "wh-1", toWarehouseId: "wh-2", quantity: 5, unitCost: 6, initiatedByName: "Jordan" }) }),
      );
      expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-1", materialCatalogItemId: "mat-1" } },
          update: { quantityOnHand: { decrement: 5 } },
        }),
      );
    });
  });

  describe("receive()", () => {
    it("rejects a transfer that isn't in transit", async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue({ id: "t-1", status: "received" });
      await expect(service.receive(COMPANY_A, "Alex", "t-1")).rejects.toThrow(BadRequestException);
    });

    it("credits the destination at the captured unit cost", async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue({
        id: "t-1",
        status: "in_transit",
        fromWarehouseId: "wh-1",
        toWarehouseId: "wh-2",
        materialCatalogItemId: "mat-1",
        quantity: "5",
        unitCost: "6",
      });
      stockService.computeSingleWarehouseCosting.mockResolvedValue({ movementUnitCost: 6, averageCostUpdate: 6, layerOps: [] });

      await service.receive(COMPANY_A, "Alex", "t-1");

      expect(stockService.computeSingleWarehouseCosting).toHaveBeenCalledWith(COMPANY_A, "wh-2", "mat-1", "receipt", 5, 6);
      expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "received", receivedByName: "Alex" }) }),
      );
      expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-2", materialCatalogItemId: "mat-1" } },
          update: { quantityOnHand: { increment: "5" }, averageCost: 6 },
        }),
      );
    });
  });

  describe("cancel()", () => {
    it("rejects a transfer that isn't in transit", async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue({ id: "t-1", status: "cancelled" });
      await expect(service.cancel(COMPANY_A, "t-1")).rejects.toThrow(BadRequestException);
    });

    it("credits the source back at the captured unit cost", async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue({
        id: "t-1",
        status: "in_transit",
        fromWarehouseId: "wh-1",
        toWarehouseId: "wh-2",
        materialCatalogItemId: "mat-1",
        quantity: "5",
        unitCost: "6",
      });
      stockService.computeSingleWarehouseCosting.mockResolvedValue({ movementUnitCost: 6, averageCostUpdate: 6, layerOps: [] });

      await service.cancel(COMPANY_A, "t-1");

      expect(stockService.computeSingleWarehouseCosting).toHaveBeenCalledWith(COMPANY_A, "wh-1", "mat-1", "receipt", 5, 6);
      expect(prisma.stockTransfer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "cancelled" }) }));
      expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-1", materialCatalogItemId: "mat-1" } },
          update: { quantityOnHand: { increment: "5" }, averageCost: 6 },
        }),
      );
    });
  });
});
