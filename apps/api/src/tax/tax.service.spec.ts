import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TaxService } from "./tax.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("TaxService", () => {
  let service: TaxService;
  let prisma: {
    taxJurisdiction: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    taxRate: { create: jest.Mock; findMany: jest.Mock };
    taxExemptionCertificate: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    client: { findFirst: jest.Mock; update: jest.Mock };
    invoice: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      taxJurisdiction: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      taxRate: { create: jest.fn(), findMany: jest.fn() },
      taxExemptionCertificate: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      client: { findFirst: jest.fn(), update: jest.fn() },
      invoice: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TaxService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(TaxService);
  });

  describe("recalculateInvoiceTax()", () => {
    it("uses the client's jurisdiction when the invoice has none of its own yet", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        clientId: "client-1",
        number: "INV-1",
        subtotal: 1000,
        taxJurisdictionId: null,
        createdAt: new Date("2026-06-01"),
        client: { taxJurisdictionId: "juris-1" },
      });
      prisma.taxRate.findMany.mockResolvedValue([{ ratePercent: 8, effectiveFrom: new Date("2025-01-01"), effectiveTo: null }]);
      prisma.taxExemptionCertificate.findFirst.mockResolvedValue(null);
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", taxAmount: 80, total: 1080 });

      await service.recalculateInvoiceTax(COMPANY_A, { name: "Staff" }, "inv-1");

      const call = prisma.invoice.update.mock.calls[0][0];
      expect(call.data.taxAmount).toBe(80);
      expect(call.data.total).toBe(1080);
      expect(call.data.taxJurisdictionId).toBe("juris-1");
    });

    it("zeroes tax when the client has a currently-valid exemption certificate", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        clientId: "client-1",
        number: "INV-1",
        subtotal: 1000,
        taxJurisdictionId: "juris-1",
        createdAt: new Date("2026-06-01"),
        client: { taxJurisdictionId: "juris-1" },
      });
      prisma.taxRate.findMany.mockResolvedValue([{ ratePercent: 8, effectiveFrom: new Date("2025-01-01"), effectiveTo: null }]);
      prisma.taxExemptionCertificate.findFirst.mockResolvedValue({ id: "cert-1" });
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", taxAmount: 0, total: 1000 });

      await service.recalculateInvoiceTax(COMPANY_A, { name: "Staff" }, "inv-1");

      const call = prisma.invoice.update.mock.calls[0][0];
      expect(call.data.taxAmount).toBe(0);
      expect(call.data.total).toBe(1000);
    });

    it("refuses to recalculate tax on a progress-billing draw, since it would discard the retainage withholding and double the already-included tax", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        clientId: "client-1",
        number: "INV-1",
        subtotal: 1000,
        taxJurisdictionId: null,
        percentComplete: 25,
        isRetainageRelease: false,
        createdAt: new Date("2026-06-01"),
        client: { taxJurisdictionId: "juris-1" },
      });

      await expect(service.recalculateInvoiceTax(COMPANY_A, { name: "Staff" }, "inv-1")).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it("refuses to recalculate tax on a retainage-release invoice", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        clientId: "client-1",
        number: "INV-1",
        subtotal: 1000,
        taxJurisdictionId: null,
        percentComplete: null,
        isRetainageRelease: true,
        createdAt: new Date("2026-06-01"),
        client: { taxJurisdictionId: "juris-1" },
      });

      await expect(service.recalculateInvoiceTax(COMPANY_A, { name: "Staff" }, "inv-1")).rejects.toThrow(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it("computes zero tax when no jurisdiction is set at all", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        clientId: "client-1",
        number: "INV-1",
        subtotal: 1000,
        taxJurisdictionId: null,
        createdAt: new Date("2026-06-01"),
        client: { taxJurisdictionId: null },
      });
      prisma.taxExemptionCertificate.findFirst.mockResolvedValue(null);
      prisma.invoice.update.mockResolvedValue({ id: "inv-1", taxAmount: 0, total: 1000 });

      await service.recalculateInvoiceTax(COMPANY_A, { name: "Staff" }, "inv-1");

      expect(prisma.taxRate.findMany).not.toHaveBeenCalled();
      const call = prisma.invoice.update.mock.calls[0][0];
      expect(call.data.taxAmount).toBe(0);
    });
  });

  describe("taxLiabilityReport()", () => {
    it("sums subtotal and tax collected across matching invoices", async () => {
      prisma.taxJurisdiction.findFirst.mockResolvedValue({ id: "juris-1" });
      prisma.invoice.findMany.mockResolvedValue([
        { number: "INV-1", subtotal: 1000, taxAmount: 80, createdAt: new Date() },
        { number: "INV-2", subtotal: 500, taxAmount: 40, createdAt: new Date() },
      ]);

      const result = await service.taxLiabilityReport(COMPANY_A, "juris-1", new Date("2026-01-01"), new Date("2026-12-31"));

      expect(result.totalTaxableSales).toBe(1500);
      expect(result.totalTaxCollected).toBe(120);
    });
  });
});
