import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { StockService } from "./stock.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { STOCK_ALERTS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

describe("StockService.setBinLocation", () => {
  let service: StockService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findFirst: jest.Mock };
    stockLevel: { upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn() },
      materialCatalogItem: { findFirst: jest.fn() },
      stockLevel: { upsert: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(STOCK_ALERTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(StockService);
  });

  it("throws when the warehouse doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(
      service.setBinLocation(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", binLocation: "A-12" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.stockLevel.upsert).not.toHaveBeenCalled();
  });

  it("throws when the material doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.materialCatalogItem.findFirst.mockResolvedValue(null);
    await expect(
      service.setBinLocation(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", binLocation: "A-12" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("upserts the StockLevel row with the bin location", async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
    prisma.stockLevel.upsert.mockResolvedValue({ id: "level-1", binLocation: "A-12" });

    const result = await service.setBinLocation(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", binLocation: "A-12" });

    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith({
      where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-1", materialCatalogItemId: "mat-1" } },
      create: { warehouseId: "wh-1", materialCatalogItemId: "mat-1", binLocation: "A-12" },
      update: { binLocation: "A-12" },
    });
    expect(result.binLocation).toBe("A-12");
  });
});

describe("StockService.recordMovement — costing", () => {
  let service: StockService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    stockLevel: { upsert: jest.Mock; findUnique: jest.Mock };
    stockMovement: { create: jest.Mock };
    inventoryCostLayer: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "wh-1" }) },
      materialCatalogItem: { findFirst: jest.fn().mockResolvedValue({ id: "mat-1" }) },
      company: { findUniqueOrThrow: jest.fn() },
      stockLevel: { upsert: jest.fn((args) => args), findUnique: jest.fn() },
      stockMovement: { create: jest.fn((args) => args) },
      inventoryCostLayer: { create: jest.fn((args) => args), findMany: jest.fn(), update: jest.fn((args) => args), delete: jest.fn((args) => args) },
      // recordMovement now runs inside runSerializable(this.prisma, async (tx) => {...}) — the
      // mock just invokes the callback against this same prisma double.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(STOCK_ALERTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(StockService);
  });

  it("weighted_average: blends a costed receipt into the running average and records the paid unitCost", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "weighted_average" });
    prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: "10", averageCost: "5" });

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "receipt", quantity: 10, unitCost: 7 });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitCost: 7 }) }));
    // (10*5 + 10*7) / 20 = 6
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ averageCost: 6 }) }));
    expect(prisma.inventoryCostLayer.create).not.toHaveBeenCalled();
  });

  it("weighted_average: costs an issue at the current average and leaves the average itself unchanged", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "weighted_average" });
    prisma.stockLevel.findUnique.mockResolvedValue({ quantityOnHand: "10", averageCost: "6" });

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "issue", quantity: 4 });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitCost: 6 }) }));
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { quantityOnHand: { increment: -4 } } }));
  });

  it("issue against a material with no cost history yet records no unitCost", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "weighted_average" });
    prisma.stockLevel.findUnique.mockResolvedValue(null);

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "issue", quantity: 4 });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitCost: undefined }) }));
  });

  it("fifo: a costed receipt opens a new cost layer instead of touching the average", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "fifo" });
    prisma.stockLevel.findUnique.mockResolvedValue(null);

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "receipt", quantity: 20, unitCost: 3 });

    expect(prisma.inventoryCostLayer.create).toHaveBeenCalledWith({
      data: { companyId: COMPANY_A, warehouseId: "wh-1", materialCatalogItemId: "mat-1", remainingQuantity: 20, unitCost: 3 },
    });
  });

  it("fifo: an issue consumes the oldest layer first and deletes it once exhausted", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "fifo" });
    prisma.inventoryCostLayer.findMany.mockResolvedValue([
      { id: "l1", remainingQuantity: "5", unitCost: "4" },
      { id: "l2", remainingQuantity: "10", unitCost: "6" },
    ]);

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "issue", quantity: 8 });

    expect(prisma.inventoryCostLayer.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
    expect(prisma.inventoryCostLayer.update).toHaveBeenCalledWith({ where: { id: "l2" }, data: { remainingQuantity: 7 } });
    // (5*4 + 3*6) / 8 = 4.75
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitCost: 4.75 }) }));
  });

  it("retries once on a serializable-transaction write conflict, then succeeds", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "weighted_average" });
    prisma.stockLevel.findUnique.mockResolvedValue(null);
    const conflict = new Prisma.PrismaClientKnownRequestError("Transaction write conflict", { code: "P2034", clientVersion: "test" });
    prisma.$transaction
      .mockImplementationOnce(() => Promise.reject(conflict))
      .mockImplementationOnce((fn: (tx: unknown) => unknown) => fn(prisma));

    await service.recordMovement(COMPANY_A, { warehouseId: "wh-1", materialCatalogItemId: "mat-1", type: "issue", quantity: 4 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
  });
});

describe("StockService.transferStock", () => {
  let service: StockService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    materialCatalogItem: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    stockLevel: { upsert: jest.Mock; findUnique: jest.Mock };
    stockMovement: { create: jest.Mock };
    inventoryCostLayer: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "wh" }) },
      materialCatalogItem: { findFirst: jest.fn().mockResolvedValue({ id: "mat-1" }) },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ inventoryCostingMethod: "weighted_average" }) },
      stockLevel: { upsert: jest.fn((args) => args), findUnique: jest.fn() },
      stockMovement: { create: jest.fn((args) => args) },
      inventoryCostLayer: { create: jest.fn((args) => args), findMany: jest.fn(), update: jest.fn((args) => args), delete: jest.fn((args) => args) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    queue = { add: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [StockService, { provide: PrismaService, useValue: prisma }, { provide: getQueueToken(STOCK_ALERTS_QUEUE), useValue: queue }],
    }).compile();

    service = module.get(StockService);
  });

  it("debits the source and credits the destination, carrying the source's average cost", async () => {
    prisma.stockLevel.findUnique
      .mockResolvedValueOnce({ quantityOnHand: "20", averageCost: "5" }) // source level (cost basis)
      .mockResolvedValueOnce({ quantityOnHand: "0", averageCost: null }); // destination level (blend target)

    await service.transferStock(COMPANY_A, { fromWarehouseId: "wh-1", toWarehouseId: "wh-2", materialCatalogItemId: "mat-1", quantity: 5 });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "transfer", quantity: 5, unitCost: 5 }) }));
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-1", materialCatalogItemId: "mat-1" } },
        update: { quantityOnHand: { decrement: 5 } },
      }),
    );
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warehouseId_materialCatalogItemId: { warehouseId: "wh-2", materialCatalogItemId: "mat-1" } },
        update: { quantityOnHand: { increment: 5 }, averageCost: 5 },
      }),
    );
  });
});

describe("StockService.inventoryValuation", () => {
  let service: StockService;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock };
    stockLevel: { findMany: jest.Mock };
    inventoryCostLayer: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUniqueOrThrow: jest.fn() },
      stockLevel: { findMany: jest.fn() },
      inventoryCostLayer: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(STOCK_ALERTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(StockService);
  });

  it("weighted_average: values on-hand quantity at the running average cost", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "weighted_average" });
    prisma.stockLevel.findMany.mockResolvedValue([
      {
        warehouseId: "wh-1",
        materialCatalogItemId: "mat-1",
        quantityOnHand: "10",
        averageCost: "6",
        warehouse: { name: "Main" },
        materialCatalogItem: { name: "2x4 Lumber", unit: "ea" },
      },
    ]);

    const result = await service.inventoryValuation(COMPANY_A);

    expect(result.rows).toEqual([
      { warehouseId: "wh-1", warehouseName: "Main", materialCatalogItemId: "mat-1", materialName: "2x4 Lumber", unit: "ea", quantity: 10, unitValue: 6, totalValue: 60 },
    ]);
    expect(result.totalValue).toBe(60);
  });

  it("fifo: values on-hand quantity as the sum of remaining cost layers", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ inventoryCostingMethod: "fifo" });
    prisma.inventoryCostLayer.findMany.mockResolvedValue([
      { warehouseId: "wh-1", materialCatalogItemId: "mat-1", remainingQuantity: "5", unitCost: "4", warehouse: { name: "Main" }, materialCatalogItem: { name: "2x4 Lumber", unit: "ea" } },
      { warehouseId: "wh-1", materialCatalogItemId: "mat-1", remainingQuantity: "3", unitCost: "6", warehouse: { name: "Main" }, materialCatalogItem: { name: "2x4 Lumber", unit: "ea" } },
    ]);

    const result = await service.inventoryValuation(COMPANY_A);

    expect(result.rows).toEqual([
      { warehouseId: "wh-1", warehouseName: "Main", materialCatalogItemId: "mat-1", materialName: "2x4 Lumber", unit: "ea", quantity: 8, totalValue: 38, unitValue: 4.75 },
    ]);
  });
});
