import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { VendorBillsService } from "./vendor-bills.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

function bill(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bill-1",
    companyId: COMPANY_A,
    billNumber: "B-100",
    status: "draft",
    supplier: { id: "sup-1", name: "Acme Supply" },
    purchaseOrder: null,
    lines: [{ materialCatalogItemId: "m1", description: "Tile", quantity: 10, unitPrice: 5 }],
    ...overrides,
  };
}

describe("VendorBillsService", () => {
  let service: VendorBillsService;
  let prisma: {
    vendorBill: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    supplier: { findFirst: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock };
    materialCatalogItem: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      vendorBill: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      supplier: { findFirst: jest.fn() },
      purchaseOrder: { findFirst: jest.fn() },
      materialCatalogItem: { count: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        VendorBillsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(VendorBillsService);
  });

  describe("create()", () => {
    it("rejects a bill for a supplier that doesn't belong to the company", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          supplierId: "sup-1",
          billNumber: "B-1",
          lines: [{ description: "Tile", quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a purchase order that doesn't belong to the given supplier", async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Acme" });
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, {
          supplierId: "sup-1",
          purchaseOrderId: "po-1",
          billNumber: "B-1",
          lines: [{ description: "Tile", quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a bill and returns its no_po match status when there's no linked PO", async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Acme" });
      prisma.materialCatalogItem.count.mockResolvedValue(0);
      prisma.vendorBill.create.mockResolvedValue(bill());

      const result = await service.create(COMPANY_A, { name: "Owner" }, {
        supplierId: "sup-1",
        billNumber: "B-100",
        lines: [{ description: "Tile", quantity: 10, unitPrice: 5 }],
      });

      expect(result.match.status).toBe("no_po");
    });
  });

  describe("approve()", () => {
    it("rejects approving a bill that isn't in draft", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "approved" }));

      await expect(service.approve(COMPANY_A, { name: "Owner" }, "bill-1")).rejects.toThrow(BadRequestException);
    });

    it("approves a draft bill and stamps the approver", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill());
      prisma.vendorBill.update.mockResolvedValue(bill({ status: "approved", approvedByName: "Owner" }));

      const result = await service.approve(COMPANY_A, { name: "Owner" }, "bill-1");

      expect(result.status).toBe("approved");
      const call = prisma.vendorBill.update.mock.calls[0][0];
      expect(call.data.approvedByName).toBe("Owner");
    });
  });

  describe("markPaid()", () => {
    it("rejects marking a draft bill (not yet approved) as paid", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "draft" }));

      await expect(service.markPaid(COMPANY_A, { name: "Owner" }, "bill-1")).rejects.toThrow(BadRequestException);
    });

    it("marks an approved bill as paid", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "approved" }));
      prisma.vendorBill.update.mockResolvedValue(bill({ status: "paid" }));

      const result = await service.markPaid(COMPANY_A, { name: "Owner" }, "bill-1");

      expect(result.status).toBe("paid");
    });
  });

  describe("get() — 3-way match", () => {
    it("flags a variance when the bill's line total differs from the PO's ordered total", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(
        bill({
          purchaseOrder: { lines: [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }] },
          lines: [{ materialCatalogItemId: "m1", description: "Tile", quantity: 12, unitPrice: 5 }],
        }),
      );

      const result = await service.get(COMPANY_A, "bill-1");

      expect(result.match.status).toBe("variance");
    });

    it("reports matched when the bill's lines equal the PO's ordered lines", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(
        bill({
          purchaseOrder: { lines: [{ materialCatalogItemId: "m1", quantity: 10, unitPrice: 5 }] },
          lines: [{ materialCatalogItemId: "m1", description: "Tile", quantity: 10, unitPrice: 5 }],
        }),
      );

      const result = await service.get(COMPANY_A, "bill-1");

      expect(result.match.status).toBe("matched");
    });
  });

  describe("schedulePayment()", () => {
    it("rejects scheduling a payment for a bill that isn't approved", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "draft" }));
      await expect(
        service.schedulePayment(COMPANY_A, { userId: "u1", name: "Accountant" }, "bill-1", { scheduledPaymentDate: "2026-09-15T00:00:00.000Z" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.vendorBill.update).not.toHaveBeenCalled();
    });

    it("sets the scheduled payment date on an approved bill", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "approved" }));
      prisma.vendorBill.update.mockResolvedValue(bill({ status: "approved", scheduledPaymentDate: new Date("2026-09-15T00:00:00.000Z") }));

      await service.schedulePayment(COMPANY_A, { userId: "u1", name: "Accountant" }, "bill-1", { scheduledPaymentDate: "2026-09-15T00:00:00.000Z" });

      expect(prisma.vendorBill.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { scheduledPaymentDate: new Date("2026-09-15T00:00:00.000Z") } }),
      );
    });
  });

  describe("disbursementCalendar()", () => {
    it("buckets approved bills by scheduledPaymentDate, falling back to dueDate", async () => {
      const inOneWeek = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      prisma.vendorBill.findMany.mockResolvedValue([
        bill({ status: "approved", scheduledPaymentDate: new Date(inOneWeek), dueDate: null, lines: [{ quantity: 2, unitPrice: 100 }] }),
        bill({ status: "approved", scheduledPaymentDate: null, dueDate: new Date(inOneWeek), lines: [{ quantity: 1, unitPrice: 50 }] }),
      ]);

      const result = await service.disbursementCalendar(COMPANY_A);

      expect(prisma.vendorBill.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY_A, status: "approved" } }));
      const totalScheduled = result.buckets.reduce((sum, b) => sum + b.total, 0);
      expect(totalScheduled).toBe(250);
      expect(result.unscheduledTotal).toBe(0);
    });
  });
});
