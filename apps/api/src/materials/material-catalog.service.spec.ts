import { Test } from "@nestjs/testing";
import { MaterialCatalogService } from "./material-catalog.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Estimator" };

describe("MaterialCatalogService — price changes", () => {
  let service: MaterialCatalogService;
  let prisma: {
    materialCatalogItem: { findFirst: jest.Mock; update: jest.Mock };
    materialPriceChange: { create: jest.Mock; findMany: jest.Mock };
    rateCatalogItemMaterial: { findMany: jest.Mock };
    estimate: { findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      materialCatalogItem: { findFirst: jest.fn(), update: jest.fn() },
      materialPriceChange: { create: jest.fn(), findMany: jest.fn() },
      rateCatalogItemMaterial: { findMany: jest.fn() },
      estimate: { findMany: jest.fn() },
    };
    audit = { record: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MaterialCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooks },
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
      expect(webhooks.trigger).not.toHaveBeenCalled();
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
      expect(webhooks.trigger).toHaveBeenCalledWith(
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
});
