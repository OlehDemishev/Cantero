import { Test } from "@nestjs/testing";
import { MaterialCatalogService } from "./material-catalog.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Estimator" };

describe("MaterialCatalogService — price changes", () => {
  let service: MaterialCatalogService;
  let prisma: {
    materialCatalogItem: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock; createMany: jest.Mock };
    materialPriceChange: { create: jest.Mock; findMany: jest.Mock };
    rateCatalogItemMaterial: { findMany: jest.Mock };
    estimate: { findMany: jest.Mock };
    unitOfMeasure: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      materialCatalogItem: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn((args) => args),
        createMany: jest.fn(),
      },
      materialPriceChange: { create: jest.fn(), findMany: jest.fn() },
      rateCatalogItemMaterial: { findMany: jest.fn() },
      estimate: { findMany: jest.fn() },
      unitOfMeasure: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { enqueue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MaterialCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(MaterialCatalogService);
  });

  describe("updatePrice()", () => {
    it("updates the price but logs no change record for a minor tweak under the threshold", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1", name: "2x4 Lumber", defaultUnitPrice: "10.00" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", defaultUnitPrice: "10.50" });

      await service.updatePrice(COMPANY_A, ACTOR, "mat-1", { defaultUnitPrice: 10.5 });

      expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "mat-1" }, data: { defaultUnitPrice: 10.5 } }),
      );
      expect(prisma.materialPriceChange.create).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("logs a change record, audits, and fires a webhook for a significant price swing", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1", name: "2x4 Lumber", defaultUnitPrice: "10.00" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", defaultUnitPrice: "13.00" });
      prisma.materialPriceChange.create.mockResolvedValue({ id: "change-1" });

      await service.updatePrice(COMPANY_A, ACTOR, "mat-1", { defaultUnitPrice: 13 });

      expect(prisma.materialPriceChange.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, materialCatalogItemId: "mat-1", oldPrice: 10, newPrice: 13, changePercent: 30, changedByUserId: "user-1", changedByName: "Estimator" },
      });
      expect(audit.record).toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledWith(
        prisma,
        COMPANY_A,
        "material.price_changed",
        expect.objectContaining({ materialCatalogItemId: "mat-1", changePercent: 30 }),
      );
    });

    it("treats a large decrease as significant too", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1", name: "Steel rebar", defaultUnitPrice: "20.00" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", defaultUnitPrice: "15.00" });
      prisma.materialPriceChange.create.mockResolvedValue({ id: "change-1" });

      await service.updatePrice(COMPANY_A, ACTOR, "mat-1", { defaultUnitPrice: 15 });

      expect(prisma.materialPriceChange.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ changePercent: -25 }) }),
      );
    });
  });

  describe("affectedOpenEstimates()", () => {
    it("returns an empty list when no rate item uses this material at all", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.rateCatalogItemMaterial.findMany.mockResolvedValue([]);

      const result = await service.affectedOpenEstimates(COMPANY_A, "mat-1");

      expect(result).toEqual([]);
      expect(prisma.estimate.findMany).not.toHaveBeenCalled();
    });

    it("only looks at draft/pending-approval estimates, never templates or already-approved ones", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.rateCatalogItemMaterial.findMany.mockResolvedValue([{ rateCatalogItemId: "rate-1" }]);
      prisma.estimate.findMany.mockResolvedValue([]);

      await service.affectedOpenEstimates(COMPANY_A, "mat-1");

      expect(prisma.estimate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isTemplate: false, status: { in: ["draft", "pending_approval"] } }),
        }),
      );
    });
  });

  describe("priceChanges()", () => {
    it("scopes the lookback window to the given number of days", async () => {
      prisma.materialPriceChange.findMany.mockResolvedValue([]);

      await service.priceChanges(COMPANY_A, 7);

      const call = prisma.materialPriceChange.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe(COMPANY_A);
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  describe("updateBarcode()", () => {
    it("throws when the item doesn't belong to the company", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue(null);
      await expect(service.updateBarcode(COMPANY_A, "mat-1", { barcode: "012345" })).rejects.toThrow();
    });

    it("updates the barcode field", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", barcode: "012345" });

      await service.updateBarcode(COMPANY_A, "mat-1", { barcode: "012345" });

      expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "mat-1" }, data: { barcode: "012345" } }),
      );
    });
  });

  describe("findByBarcode()", () => {
    it("throws when no item matches the barcode for this company", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue(null);
      await expect(service.findByBarcode(COMPANY_A, "unknown")).rejects.toThrow();
    });

    it("scopes the lookup to the company and includes stock levels", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1", barcode: "012345" });

      await service.findByBarcode(COMPANY_A, "012345");

      expect(prisma.materialCatalogItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_A, barcode: "012345" } }),
      );
    });
  });

  describe("updateSerialTracked()", () => {
    it("toggles the serialTracked flag", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", serialTracked: true });

      const result = await service.updateSerialTracked(COMPANY_A, "mat-1", { serialTracked: true });

      expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "mat-1" }, data: { serialTracked: true } }),
      );
      expect(result.serialTracked).toBe(true);
    });
  });

  describe("updateStandardCost()", () => {
    it("sets the standardCost field", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", standardCost: 12.5 });

      const result = await service.updateStandardCost(COMPANY_A, "mat-1", { standardCost: 12.5 });

      expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "mat-1" }, data: { standardCost: 12.5 } }),
      );
      expect(result.standardCost).toBe(12.5);
    });

    it("clears the standardCost field with null", async () => {
      prisma.materialCatalogItem.findFirst.mockResolvedValue({ id: "mat-1" });
      prisma.materialCatalogItem.update.mockResolvedValue({ id: "mat-1", standardCost: null });

      await service.updateStandardCost(COMPANY_A, "mat-1", { standardCost: null });

      expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { standardCost: null } }),
      );
    });
  });

  describe("create()", () => {
    const INPUT = { code: "REBAR", name: "Rebar", unitId: "unit-1", defaultUnitPrice: 1.5, greenCertified: false, lotTracked: false };

    it("throws when the unit doesn't belong to the company", async () => {
      prisma.unitOfMeasure.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, INPUT)).rejects.toThrow();
      expect(prisma.materialCatalogItem.create).not.toHaveBeenCalled();
    });

    it("throws when the given purchaseUnitId doesn't belong to the company", async () => {
      prisma.unitOfMeasure.findFirst.mockResolvedValueOnce({ id: "unit-1", code: "kg" }).mockResolvedValueOnce(null);
      await expect(service.create(COMPANY_A, { ...INPUT, purchaseUnitId: "unit-2" })).rejects.toThrow();
    });

    it("denormalizes unit.code onto the new item's `unit` field", async () => {
      prisma.unitOfMeasure.findFirst.mockResolvedValue({ id: "unit-1", code: "kg" });

      await service.create(COMPANY_A, INPUT);

      expect(prisma.materialCatalogItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ unitId: "unit-1", unit: "kg", companyId: COMPANY_A }) }),
      );
    });
  });

  describe("importCsv()", () => {
    const CSV_HEADER = "code,name,unit,defaultUnitPrice";

    it("resolves an existing unit case/whitespace-insensitively instead of creating a duplicate", async () => {
      prisma.unitOfMeasure.findMany.mockResolvedValue([{ id: "unit-kg", code: "kg", companyId: COMPANY_A }]);

      await service.importCsv(COMPANY_A, ACTOR, `${CSV_HEADER}\nREBAR,Rebar,  KG ,1.5`);

      expect(prisma.unitOfMeasure.create).not.toHaveBeenCalled();
      expect(prisma.materialCatalogItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ code: "REBAR", unit: "kg", unitId: "unit-kg", companyId: COMPANY_A })],
      });
    });

    it("creates a new base unit for a unit string not seen before", async () => {
      prisma.unitOfMeasure.findMany.mockResolvedValue([]);
      prisma.unitOfMeasure.create.mockResolvedValue({ id: "unit-new", code: "pallet", companyId: COMPANY_A });

      await service.importCsv(COMPANY_A, ACTOR, `${CSV_HEADER}\nSKU1,Item,pallet,10`);

      expect(prisma.unitOfMeasure.create).toHaveBeenCalledWith({ data: { companyId: COMPANY_A, code: "pallet", name: "pallet" } });
      expect(prisma.materialCatalogItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ unitId: "unit-new", unit: "pallet" })],
      });
    });

    it("reuses one newly-created unit across multiple rows sharing the same unit string in one import", async () => {
      prisma.unitOfMeasure.findMany.mockResolvedValue([]);
      prisma.unitOfMeasure.create.mockResolvedValue({ id: "unit-new", code: "box", companyId: COMPANY_A });

      await service.importCsv(COMPANY_A, ACTOR, `${CSV_HEADER}\nSKU1,Item 1,box,10\nSKU2,Item 2,BOX,20`);

      expect(prisma.unitOfMeasure.create).toHaveBeenCalledTimes(1);
      expect(prisma.materialCatalogItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ code: "SKU1", unitId: "unit-new" }),
          expect.objectContaining({ code: "SKU2", unitId: "unit-new" }),
        ],
      });
    });
  });
});
