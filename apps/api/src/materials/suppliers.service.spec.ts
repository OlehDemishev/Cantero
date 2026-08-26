import { Test } from "@nestjs/testing";
import { SuppliersService } from "./suppliers.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("SuppliersService.scorecard", () => {
  let service: SuppliersService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    purchaseOrder: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: "sup-1", name: "Acme Supply" }) },
      purchaseOrder: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }],
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
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }],
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
