import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StockCountsService } from "./stock-counts.service";
import { StockService } from "./stock.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("StockCountsService", () => {
  let service: StockCountsService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findMany: jest.Mock };
    stockLevel: { findMany: jest.Mock };
    stockCount: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    stockCountLine: { update: jest.Mock };
  };
  let stockService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn() },
      materialCatalogItem: { findMany: jest.fn() },
      stockLevel: { findMany: jest.fn() },
      stockCount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      stockCountLine: { update: jest.fn() },
    };
    stockService = { recordMovement: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        StockCountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stockService },
      ],
    }).compile();

    service = module.get(StockCountsService);
  });

  describe("create()", () => {
    it("throws when the warehouse doesn't belong to the company", async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, { warehouseId: "wh-1" })).rejects.toThrow(NotFoundException);
    });

    it("snapshots each material's current stock level as both system and initial counted quantity", async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: COMPANY_A });
      prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1" }, { id: "mat-2" }]);
      prisma.stockLevel.findMany.mockResolvedValue([{ materialCatalogItemId: "mat-1", quantityOnHand: 42 }]);
      prisma.stockCount.create.mockResolvedValue({ id: "count-1" });
      prisma.stockCount.findFirst.mockResolvedValue({ id: "count-1" });

      await service.create(COMPANY_A, { warehouseId: "wh-1" });

      const lines = prisma.stockCount.create.mock.calls[0][0].data.lines.create;
      expect(lines).toEqual([
        { materialCatalogItemId: "mat-1", systemQuantity: 42, countedQuantity: 42 },
        { materialCatalogItemId: "mat-2", systemQuantity: 0, countedQuantity: 0 },
      ]);
    });
  });

  describe("updateLine()", () => {
    it("throws when the count doesn't belong to the company", async () => {
      prisma.stockCount.findFirst.mockResolvedValue(null);
      await expect(service.updateLine(COMPANY_A, "count-1", "line-1", { countedQuantity: 5 })).rejects.toThrow(NotFoundException);
    });

    it("rejects editing a count that's already finalized", async () => {
      prisma.stockCount.findFirst.mockResolvedValue({ id: "count-1", status: "finalized", lines: [{ id: "line-1" }] });
      await expect(service.updateLine(COMPANY_A, "count-1", "line-1", { countedQuantity: 5 })).rejects.toThrow(BadRequestException);
      expect(prisma.stockCountLine.update).not.toHaveBeenCalled();
    });

    it("throws when the line doesn't belong to the count", async () => {
      prisma.stockCount.findFirst.mockResolvedValue({ id: "count-1", status: "draft", lines: [{ id: "other-line" }] });
      await expect(service.updateLine(COMPANY_A, "count-1", "line-1", { countedQuantity: 5 })).rejects.toThrow(NotFoundException);
    });

    it("updates the counted quantity on a draft count", async () => {
      prisma.stockCount.findFirst
        .mockResolvedValueOnce({ id: "count-1", status: "draft", lines: [{ id: "line-1" }] })
        .mockResolvedValueOnce({ id: "count-1", status: "draft" });

      await service.updateLine(COMPANY_A, "count-1", "line-1", { countedQuantity: 7 });

      expect(prisma.stockCountLine.update).toHaveBeenCalledWith({ where: { id: "line-1" }, data: { countedQuantity: 7 } });
    });
  });

  describe("finalize()", () => {
    it("rejects finalizing a count that isn't a draft", async () => {
      prisma.stockCount.findFirst.mockResolvedValue({ id: "count-1", status: "finalized", lines: [] });
      await expect(service.finalize(COMPANY_A, "count-1")).rejects.toThrow(BadRequestException);
    });

    it("records a receipt when counted > system, a write_off when counted < system, and skips zero-delta lines", async () => {
      prisma.stockCount.findFirst.mockResolvedValue({
        id: "count-1",
        status: "draft",
        warehouseId: "wh-1",
        lines: [
          { materialCatalogItemId: "mat-1", systemQuantity: 10, countedQuantity: 15 },
          { materialCatalogItemId: "mat-2", systemQuantity: 10, countedQuantity: 4 },
          { materialCatalogItemId: "mat-3", systemQuantity: 10, countedQuantity: 10 },
        ],
      });

      await service.finalize(COMPANY_A, "count-1");

      expect(stockService.recordMovement).toHaveBeenCalledTimes(2);
      expect(stockService.recordMovement).toHaveBeenCalledWith(COMPANY_A, {
        warehouseId: "wh-1",
        materialCatalogItemId: "mat-1",
        type: "receipt",
        quantity: 5,
      });
      expect(stockService.recordMovement).toHaveBeenCalledWith(COMPANY_A, {
        warehouseId: "wh-1",
        materialCatalogItemId: "mat-2",
        type: "write_off",
        quantity: 6,
      });
    });

    it("marks the count finalized with a timestamp", async () => {
      prisma.stockCount.findFirst.mockResolvedValue({ id: "count-1", status: "draft", warehouseId: "wh-1", lines: [] });

      await service.finalize(COMPANY_A, "count-1");

      expect(prisma.stockCount.update).toHaveBeenCalledWith({
        where: { id: "count-1" },
        data: { status: "finalized", finalizedAt: expect.any(Date) },
      });
    });
  });
});
