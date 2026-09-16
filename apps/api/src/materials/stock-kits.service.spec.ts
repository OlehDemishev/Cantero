import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { StockKitsService } from "./stock-kits.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StockService } from "./stock.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("StockKitsService.create", () => {
  let service: StockKitsService;
  let prisma: {
    materialCatalogItem: { findFirst: jest.Mock; count: jest.Mock };
    stockKit: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      materialCatalogItem: { findFirst: jest.fn().mockResolvedValue({ id: "kit-item" }), count: jest.fn().mockResolvedValue(1) },
      stockKit: { create: jest.fn((args) => args) },
    };
    const module = await Test.createTestingModule({
      providers: [
        StockKitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(StockKitsService);
  });

  const INPUT = {
    kitMaterialCatalogItemId: "kit-item",
    name: "Assembled Fixture",
    components: [{ materialCatalogItemId: "comp-1", quantityPerKit: 2 }],
  };

  it("throws when the finished item doesn't belong to the company", async () => {
    prisma.materialCatalogItem.findFirst.mockResolvedValue(null);
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(NotFoundException);
  });

  it("rejects a component that equals the kit's own finished item", async () => {
    await expect(
      service.create(COMPANY_A, ACTOR, { ...INPUT, components: [{ materialCatalogItemId: "kit-item", quantityPerKit: 1 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects duplicate components in the same kit", async () => {
    await expect(
      service.create(COMPANY_A, ACTOR, {
        ...INPUT,
        components: [
          { materialCatalogItemId: "comp-1", quantityPerKit: 1 },
          { materialCatalogItemId: "comp-1", quantityPerKit: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a component material not owned by the company", async () => {
    prisma.materialCatalogItem.count.mockResolvedValue(0);
    await expect(service.create(COMPANY_A, ACTOR, INPUT)).rejects.toThrow(BadRequestException);
  });

  it("creates the kit with its components", async () => {
    await service.create(COMPANY_A, ACTOR, INPUT);
    expect(prisma.stockKit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_A,
          kitMaterialCatalogItemId: "kit-item",
          name: "Assembled Fixture",
          components: { create: [{ materialCatalogItemId: "comp-1", quantityPerKit: 2 }] },
        }),
      }),
    );
  });
});

describe("StockKitsService.assemble/disassemble", () => {
  let service: StockKitsService;
  let prisma: {
    warehouse: { findFirst: jest.Mock };
    stockKit: { findFirst: jest.Mock };
    stockMovement: { create: jest.Mock };
    stockLevel: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let stockService: { computeSingleWarehouseCosting: jest.Mock };

  const KIT = {
    id: "kit-1",
    name: "Assembled Fixture",
    kitMaterialCatalogItemId: "kit-item",
    components: [{ materialCatalogItemId: "comp-1", quantityPerKit: "2" }],
  };

  beforeEach(async () => {
    prisma = {
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: "wh-1" }) },
      stockKit: { findFirst: jest.fn().mockResolvedValue(KIT) },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: "mvmt-1" }) },
      stockLevel: { upsert: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    stockService = {
      // Mirrors the real computeSingleWarehouseCosting's receipt branch (echoes back the unitCost
      // it was given) closely enough for this test: issues always cost 10/unit, receipts return
      // whatever unitCost the caller computed and passed in.
      computeSingleWarehouseCosting: jest.fn((_tx, _companyId, _warehouseId, _materialId, type, _quantity, unitCost) =>
        Promise.resolve({ movementUnitCost: type === "receipt" ? (unitCost ?? null) : 10, averageCostUpdate: null }),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        StockKitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stockService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(StockKitsService);
  });

  it("assemble: issues each component once and receives the kit once", async () => {
    await service.assemble(COMPANY_A, ACTOR, "wh-1", "kit-1", 3);

    // component: 2 per kit * 3 kits = 6
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materialCatalogItemId: "comp-1", type: "issue", quantity: 6 }) }),
    );
    // kit receipt: quantity 3, unitCost = sum(componentCost) = 10*6 = 60, /3 kits = 20
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materialCatalogItemId: "kit-item", type: "receipt", quantity: 3, unitCost: 20 }) }),
    );
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it("disassemble: issues the kit once and receives each component back", async () => {
    await service.disassemble(COMPANY_A, ACTOR, "wh-1", "kit-1", 3);

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materialCatalogItemId: "kit-item", type: "issue", quantity: 3 }) }),
    );
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materialCatalogItemId: "comp-1", type: "receipt", quantity: 6 }) }),
    );
  });

  it("throws when the kit doesn't belong to the company", async () => {
    prisma.stockKit.findFirst.mockResolvedValue(null);
    await expect(service.assemble(COMPANY_A, ACTOR, "wh-1", "kit-1", 1)).rejects.toThrow(NotFoundException);
  });

  it("throws when the warehouse doesn't belong to the company", async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.assemble(COMPANY_A, ACTOR, "wh-1", "kit-1", 1)).rejects.toThrow(NotFoundException);
  });
});
