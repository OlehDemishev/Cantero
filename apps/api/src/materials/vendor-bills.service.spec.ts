import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { VendorBillsService } from "./vendor-bills.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { GobdLedgerService } from "../common/gobd/gobd-ledger.service";

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
    $transaction: jest.Mock;
  };
  let gobdLedger: { append: jest.Mock };

  beforeEach(async () => {
    prisma = {
      vendorBill: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      supplier: { findFirst: jest.fn() },
      purchaseOrder: { findFirst: jest.fn() },
      materialCatalogItem: { count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    gobdLedger = { append: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        VendorBillsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: GobdLedgerService, useValue: gobdLedger },
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

    it("locks the bill under GoBD Festschreibung and writes a vendor_bill.locked ledger entry", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill());
      prisma.vendorBill.update.mockResolvedValue(bill({ status: "approved" }));

      await service.approve(COMPANY_A, { name: "Owner" }, "bill-1");

      expect(prisma.vendorBill.update.mock.calls[0][0].data.lockedAt).toBeInstanceOf(Date);
      expect(gobdLedger.append).toHaveBeenCalledWith(
        prisma,
        COMPANY_A,
        { name: "Owner" },
        "vendor_bill.locked",
        "VendorBill",
        "bill-1",
        expect.stringContaining("B-100"),
        expect.objectContaining({ billNumber: "B-100" }),
      );
    });
  });

  describe("void() — GoBD correction", () => {
    it("refuses to void a draft (never-locked) bill", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "draft", lockedAt: null }));
      await expect(service.void(COMPANY_A, { name: "Owner" }, "bill-1", "duplicate")).rejects.toThrow(BadRequestException);
    });

    it("refuses to void an already-void bill", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "void", lockedAt: new Date() }));
      await expect(service.void(COMPANY_A, { name: "Owner" }, "bill-1", "duplicate")).rejects.toThrow(BadRequestException);
    });

    it("marks an approved bill void with the given reason and records it in the ledger", async () => {
      prisma.vendorBill.findFirst.mockResolvedValue(bill({ status: "approved", lockedAt: new Date("2026-09-01") }));
      prisma.vendorBill.update.mockResolvedValue(bill({ status: "void" }));

      const result = await service.void(COMPANY_A, { name: "Owner" }, "bill-1", "Duplicate entry from supplier");

      expect(result.status).toBe("void");
      expect(prisma.vendorBill.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "bill-1" }, data: expect.objectContaining({ status: "void", voidReason: "Duplicate entry from supplier" }) }),
      );
      expect(gobdLedger.append).toHaveBeenCalledWith(
        prisma,
        COMPANY_A,
        { name: "Owner" },
        "vendor_bill.voided",
        "VendorBill",
        "bill-1",
        expect.stringContaining("Duplicate entry from supplier"),
        expect.any(Object),
      );
    });
  });

  describe("exportSage300Cre()", () => {
    const exportable = (over: Record<string, unknown> = {}) => ({
      id: "bill-1",
      billNumber: "B-100",
      billDate: new Date("2026-09-10"),
      dueDate: null,
      scheduledPaymentDate: null,
      notes: null,
      supplier: { name: "Acme Supply", sageVendorId: "ACME" },
      lines: [{ description: "Tile", quantity: 10, unitPrice: 5 }],
      ...over,
    });

    it("refuses when there's nothing approved or paid to export", async () => {
      prisma.vendorBill.findMany.mockResolvedValue([]);
      await expect(service.exportSage300Cre(COMPANY_A, { name: "Owner" }, {})).rejects.toThrow(BadRequestException);
    });

    it("only asks for approved/paid bills", async () => {
      prisma.vendorBill.findMany.mockResolvedValue([exportable()]);
      await service.exportSage300Cre(COMPANY_A, { name: "Owner" }, {});
      expect(prisma.vendorBill.findMany.mock.calls[0][0].where.status).toEqual({ in: ["approved", "paid"] });
    });

    it("refuses the whole export when a supplier has no Sage Vendor ID, naming the bill", async () => {
      prisma.vendorBill.findMany.mockResolvedValue([exportable({ supplier: { name: "Acme Supply", sageVendorId: null } })]);
      await expect(service.exportSage300Cre(COMPANY_A, { name: "Owner" }, {})).rejects.toThrow(/B-100.*no Sage Vendor ID/);
    });

    it("returns an APIF/APDF file with the given accounts", async () => {
      prisma.vendorBill.findMany.mockResolvedValue([exportable()]);
      const text = await service.exportSage300Cre(COMPANY_A, { name: "Owner" }, { expenseAccount: "50-1000" });
      const rows = text.trim().split("\r\n");
      expect(rows[0].startsWith("APIF,ACME,B-100")).toBe(true);
      expect(rows[1].split(",")[11]).toBe("50-1000");
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
