import { BadRequestException, NotFoundException } from "@nestjs/common";
import { IncomingEInvoicesService } from "./incoming-e-invoices.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { buildXRechnungXml, type BuildXRechnungXmlInput } from "./e-invoice";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

function realXRechnungXml(overrides: Partial<BuildXRechnungXmlInput> = {}): string {
  return buildXRechnungXml({
    invoiceNumber: "SUP-2026-001",
    issueDate: new Date("2026-09-01"),
    dueDate: new Date("2026-09-30"),
    currency: "EUR",
    seller: {
      name: "Beton Schmidt GmbH",
      street: "Lieferstraße 1",
      city: "Hamburg",
      postalCode: "20095",
      countryCode: "DE",
      vatId: "DE999888777",
      iban: "DE12500105170648489890",
    },
    buyer: { name: "Cantero Demo GmbH", street: "S", city: "Berlin", postalCode: "10115", countryCode: "DE", vatId: null },
    lines: [{ description: "Ready-mix concrete", quantity: 20, unitPrice: 120, lineTotal: 2400 }],
    subtotal: 2400,
    taxAmount: 456,
    total: 2856,
    ...overrides,
  });
}

function xmlFile(xml: string, name = "invoice.xml"): Express.Multer.File {
  return { originalname: name, mimetype: "application/xml", buffer: Buffer.from(xml, "utf-8") } as Express.Multer.File;
}

describe("IncomingEInvoicesService", () => {
  let service: IncomingEInvoicesService;
  let prisma: {
    incomingEInvoice: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    supplier: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: { save: jest.Mock; read: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = {
      incomingEInvoice: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      supplier: { findFirst: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "company-a/abc-invoice.xml", size: 100 }), read: jest.fn() };
    audit = { record: jest.fn() };
    service = new IncomingEInvoicesService(prisma as unknown as PrismaService, storage as unknown as StorageService, audit as unknown as AuditService);
  });

  describe("upload()", () => {
    it("rejects a file that's neither XML nor PDF", async () => {
      const file = { originalname: "invoice.docx", mimetype: "application/msword", buffer: Buffer.from("x") } as Express.Multer.File;
      await expect(service.upload(COMPANY_A, ACTOR, file)).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it("parses a real XRechnung XML file, finds no supplier match, and stages it as pending_review", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      prisma.incomingEInvoice.create.mockResolvedValue({ id: "ie-1", supplier: null });

      const result = await service.upload(COMPANY_A, ACTOR, xmlFile(realXRechnungXml()));

      expect(result).toEqual({ id: "ie-1" });
      const createCall = prisma.incomingEInvoice.create.mock.calls[0][0];
      expect(createCall.data.format).toBe("xrechnung_ubl");
      expect(createCall.data.status).toBe("pending_review");
      expect(createCall.data.invoiceNumber).toBe("SUP-2026-001");
      expect(createCall.data.sellerVatId).toBe("DE999888777");
      expect(createCall.data.total).toBe(2856);
      expect(createCall.data.supplierId).toBeNull();
      expect(createCall.data.lines.create).toEqual([{ description: "Ready-mix concrete", quantity: 20, unitPrice: 120, lineTotal: 2400, taxRatePercent: null }]);
    });

    it("auto-matches an existing supplier by the seller's VAT ID and stages it as matched", async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Beton Schmidt GmbH" });
      prisma.incomingEInvoice.create.mockResolvedValue({ id: "ie-1", supplier: { name: "Beton Schmidt GmbH" } });

      await service.upload(COMPANY_A, ACTOR, xmlFile(realXRechnungXml()));

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({ where: { companyId: COMPANY_A, vatId: "DE999888777" } });
      const createCall = prisma.incomingEInvoice.create.mock.calls[0][0];
      expect(createCall.data.status).toBe("matched");
      expect(createCall.data.supplierId).toBe("sup-1");
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "incoming_e_invoice.uploaded",
        "IncomingEInvoice",
        "ie-1",
        expect.stringContaining("auto-matched"),
      );
    });

    it("records EN 16931 validation errors on the row without refusing to stage it", async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      prisma.incomingEInvoice.create.mockResolvedValue({ id: "ie-1", supplier: null });
      // No invoice number and no line items — a badly broken document, but still staged.
      const xml = realXRechnungXml({ invoiceNumber: "", lines: [] }); // empty ID and no lines
      // buildXRechnungXml doesn't allow empty invoiceNumber cleanly in its own type contract, but
      // the parser must still tolerate whatever a *real* third-party sender produces — simulate by
      // stripping the ID element directly from otherwise-valid XML.
      const brokenXml = xml.replace(/<cbc:ID>.*?<\/cbc:ID>/, "").replace(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g, "");

      await service.upload(COMPANY_A, ACTOR, xmlFile(brokenXml));

      const createCall = prisma.incomingEInvoice.create.mock.calls[0][0];
      expect(createCall.data.validationErrors).toEqual(expect.arrayContaining([expect.stringContaining("BR-1"), expect.stringContaining("BR-16")]));
    });
  });

  describe("matchSupplier()", () => {
    it("throws when the supplier doesn't belong to this company", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "pending_review" });
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(service.matchSupplier(COMPANY_A, ACTOR, "ie-1", "sup-x")).rejects.toThrow(NotFoundException);
    });

    it("refuses to re-match an already-converted e-invoice", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "converted" });

      await expect(service.matchSupplier(COMPANY_A, ACTOR, "ie-1", "sup-1")).rejects.toThrow(BadRequestException);
    });

    it("sets supplierId and status: matched", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "pending_review" });
      prisma.supplier.findFirst.mockResolvedValue({ id: "sup-1", name: "Beton Schmidt GmbH" });
      prisma.incomingEInvoice.update.mockResolvedValue({ id: "ie-1", status: "matched", supplierId: "sup-1" });

      await service.matchSupplier(COMPANY_A, ACTOR, "ie-1", "sup-1");

      expect(prisma.incomingEInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ie-1" }, data: { supplierId: "sup-1", status: "matched" } }),
      );
    });
  });

  describe("convertToVendorBill()", () => {
    it("throws when no supplier has been matched yet", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "matched", supplierId: null });

      await expect(service.convertToVendorBill(COMPANY_A, ACTOR, "ie-1")).rejects.toThrow(BadRequestException);
    });

    it("throws when already converted", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "converted", supplierId: "sup-1" });

      await expect(service.convertToVendorBill(COMPANY_A, ACTOR, "ie-1")).rejects.toThrow(BadRequestException);
    });

    it("throws when rejected", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "rejected", supplierId: "sup-1" });

      await expect(service.convertToVendorBill(COMPANY_A, ACTOR, "ie-1")).rejects.toThrow(BadRequestException);
    });

    it("creates a VendorBill from the parsed data and marks the e-invoice converted, inside one transaction", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({
        id: "ie-1",
        status: "matched",
        supplierId: "sup-1",
        invoiceNumber: "SUP-2026-001",
        issueDate: new Date("2026-09-01"),
        dueDate: new Date("2026-09-30"),
        validationErrors: [],
        lines: [{ description: "Ready-mix concrete", quantity: 20, unitPrice: 120 }],
      });
      const vendorBill = { vendorBill: { create: jest.fn().mockResolvedValue({ id: "vb-1", billNumber: "SUP-2026-001" }) }, incomingEInvoice: { update: jest.fn() } };
      prisma.$transaction.mockImplementation((fn) => fn(vendorBill));

      const result = await service.convertToVendorBill(COMPANY_A, ACTOR, "ie-1");

      expect(result).toEqual({ vendorBillId: "vb-1" });
      expect(vendorBill.vendorBill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_A,
            supplierId: "sup-1",
            billNumber: "SUP-2026-001",
            lines: { create: [{ description: "Ready-mix concrete", quantity: 20, unitPrice: 120 }] },
          }),
        }),
      );
      expect(vendorBill.incomingEInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ie-1" }, data: expect.objectContaining({ status: "converted", vendorBillId: "vb-1" }) }),
      );
    });
  });

  describe("reject()", () => {
    it("throws when already converted", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "converted" });
      await expect(service.reject(COMPANY_A, ACTOR, "ie-1", "duplicate")).rejects.toThrow(BadRequestException);
    });

    it("sets status: rejected with the given reason", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", status: "pending_review" });
      prisma.incomingEInvoice.update.mockResolvedValue({ id: "ie-1", status: "rejected" });

      await service.reject(COMPANY_A, ACTOR, "ie-1", "Not our supplier");

      expect(prisma.incomingEInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "rejected", rejectedReason: "Not our supplier" }) }),
      );
    });
  });

  describe("getRawFile()", () => {
    it("throws when the e-invoice doesn't exist", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue(null);
      await expect(service.getRawFile(COMPANY_A, "ie-x")).rejects.toThrow(NotFoundException);
    });

    it("reads the stored file by its storage key", async () => {
      prisma.incomingEInvoice.findFirst.mockResolvedValue({ id: "ie-1", rawFileStorageKey: "company-a/abc.xml", rawFileName: "invoice.xml" });
      storage.read.mockResolvedValue(Buffer.from("xml content"));

      const result = await service.getRawFile(COMPANY_A, "ie-1");

      expect(storage.read).toHaveBeenCalledWith("company-a/abc.xml");
      expect(result).toEqual({ buffer: Buffer.from("xml content"), fileName: "invoice.xml" });
    });
  });
});
