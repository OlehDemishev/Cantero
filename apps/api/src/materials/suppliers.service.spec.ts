import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SuppliersService } from "./suppliers.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("SuppliersService.scorecard", () => {
  let service: SuppliersService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    purchaseOrder: { findMany: jest.Mock };
    supplierReview: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: "sup-1", name: "Acme Supply" }) },
      purchaseOrder: { findMany: jest.fn() },
      supplierReview: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(SuppliersService);
  });

  it("returns nulls for on-time rate and delay when nothing has been received yet", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([
      { receivedAt: null, expectedDate: new Date("2026-06-10"), lines: [{ quantity: "10", unitPrice: "5" }] },
    ]);

    const result = await service.scorecard(COMPANY_A, "sup-1");

    expect(result.totalOrders).toBe(1);
    expect(result.receivedOrders).toBe(0);
    expect(result.onTimeRate).toBeNull();
    expect(result.averageDelayDays).toBeNull();
    expect(result.totalSpend).toBe(50);
  });

  it("computes on-time rate and average delay across received orders", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        receivedAt: new Date("2026-06-10"),
        expectedDate: new Date("2026-06-10"),
        lines: [{ quantity: "2", unitPrice: "100" }],
      },
      {
        receivedAt: new Date("2026-06-15"),
        expectedDate: new Date("2026-06-10"),
        lines: [{ quantity: "1", unitPrice: "50" }],
      },
    ]);

    const result = await service.scorecard(COMPANY_A, "sup-1");

    expect(result.totalOrders).toBe(2);
    expect(result.receivedOrders).toBe(2);
    expect(result.onTimeRate).toBe(0.5);
    expect(result.averageDelayDays).toBeCloseTo(2.5, 5); // (0 + 5) / 2
    expect(result.totalSpend).toBe(250);
  });

  it("returns nulls for rating/wouldReorder when no reviews exist, without affecting the PO-derived fields", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    prisma.supplierReview.findMany.mockResolvedValue([]);

    const result = await service.scorecard(COMPANY_A, "sup-1");

    expect(result.reviewCount).toBe(0);
    expect(result.averageRating).toBeNull();
    expect(result.wouldReorderPercent).toBeNull();
  });

  it("aggregates rating and would-reorder% across reviews", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    prisma.supplierReview.findMany.mockResolvedValue([
      { rating: 5, wouldReorder: true },
      { rating: 3, wouldReorder: false },
      { rating: 4, wouldReorder: null },
    ]);

    const result = await service.scorecard(COMPANY_A, "sup-1");

    expect(result.reviewCount).toBe(3);
    expect(result.averageRating).toBeCloseTo(4, 1);
    // Of the 2 reviews that answered wouldReorder, 1 was true -> 50%
    expect(result.wouldReorderPercent).toBe(50);
  });
});

describe("SuppliersService documents/reviews", () => {
  let service: SuppliersService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    supplierDocument: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    supplierReview: { create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn() },
      supplierDocument: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      supplierReview: { create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(SuppliersService);
  });

  describe("addDocument()", () => {
    it("rejects a supplier that doesn't belong to this company", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.addDocument(COMPANY_A, ACTOR, "sup-1", { type: "general_liability_insurance", name: "GL Policy", expiresAt: new Date().toISOString() }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.supplierDocument.create).not.toHaveBeenCalled();
    });

    it("records an audit entry on success", async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Acme Supply" });
      prisma.supplierDocument.create.mockResolvedValue({ id: "doc-1", expiresAt: new Date() });

      await service.addDocument(COMPANY_A, ACTOR, "sup-1", {
        type: "general_liability_insurance",
        name: "GL Policy",
        expiresAt: new Date().toISOString(),
      });

      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("deleteDocument()", () => {
    it("rejects deleting a document that doesn't belong to this company's supplier", async () => {
      prisma.supplierDocument.findFirst.mockResolvedValue(null);

      await expect(service.deleteDocument(COMPANY_A, "sup-1", "doc-1")).rejects.toThrow(NotFoundException);
      expect(prisma.supplierDocument.delete).not.toHaveBeenCalled();
    });
  });

  describe("addReview()", () => {
    it("rejects a supplier that doesn't belong to this company", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.addReview(COMPANY_A, ACTOR, "sup-1", { rating: 5 })).rejects.toThrow(NotFoundException);
      expect(prisma.supplierReview.create).not.toHaveBeenCalled();
    });

    it("records a review with the reviewer's identity", async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Acme Supply" });
      prisma.supplierReview.create.mockResolvedValue({ id: "review-1" });

      await service.addReview(COMPANY_A, ACTOR, "sup-1", { rating: 4, wouldReorder: true, comments: "Reliable" });

      expect(prisma.supplierReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: COMPANY_A,
          supplierId: "sup-1",
          reviewedByUserId: ACTOR.userId,
          reviewedByName: ACTOR.name,
          rating: 4,
          wouldReorder: true,
          comments: "Reliable",
        }),
      });
    });
  });
});

describe("SuppliersService.syncCatalog", () => {
  let service: SuppliersService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    materialCatalogItem: { findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: "sup-1", companyId: COMPANY_A, name: "Acme Supply" }) },
      materialCatalogItem: { findMany: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(SuppliersService);
  });

  it("updates defaultUnitPrice for a material this supplier is preferred for", async () => {
    prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1", code: "CEM-01" }]);
    const csv = "code,unitPrice\nCEM-01,12.50\n";

    const result = await service.syncCatalog(COMPANY_A, "sup-1", csv);

    expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith({ where: { id: "mat-1" }, data: { defaultUnitPrice: 12.5 } });
    expect(result).toEqual({ created: 1, skipped: 0, errors: [] });
  });

  it("skips a row whose code isn't preferred-sourced from this supplier, without touching other materials", async () => {
    prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1", code: "CEM-01" }]);
    const csv = "code,unitPrice\nUNKNOWN-CODE,9.99\n";

    const result = await service.syncCatalog(COMPANY_A, "sup-1", csv);

    expect(prisma.materialCatalogItem.update).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain("UNKNOWN-CODE");
  });

  it("skips a row with a missing or invalid unitPrice", async () => {
    prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1", code: "CEM-01" }]);
    const csv = "code,unitPrice\nCEM-01,not-a-number\n";

    const result = await service.syncCatalog(COMPANY_A, "sup-1", csv);

    expect(prisma.materialCatalogItem.update).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("matches codes case-insensitively", async () => {
    prisma.materialCatalogItem.findMany.mockResolvedValue([{ id: "mat-1", code: "cem-01" }]);
    const csv = "code,unitPrice\nCEM-01,12.50\n";

    const result = await service.syncCatalog(COMPANY_A, "sup-1", csv);

    expect(prisma.materialCatalogItem.update).toHaveBeenCalledWith({ where: { id: "mat-1" }, data: { defaultUnitPrice: 12.5 } });
    expect(result.created).toBe(1);
  });
});
