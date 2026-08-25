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
