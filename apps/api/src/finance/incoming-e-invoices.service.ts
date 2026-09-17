import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { detectXmlFormat, parseEInvoiceXml, validateEn16931Core, type ParsedEInvoice } from "./incoming-e-invoice-parser";
import { extractZugferdXmlFromPdf } from "./extract-zugferd-xml-from-pdf";

const INCLUDE = { supplier: true, lines: true } as const;

/**
 * Receives, parses, and stages a supplier e-invoice (XRechnung/ZUGFeRD/Peppol) for human review
 * before it becomes a real VendorBill — see IncomingEInvoice's own schema doc comment for why
 * this is a staging step rather than an automatic conversion. This closes the highest-priority
 * remaining DACH e-invoicing gap: this codebase could only ever *send* e-invoices before (see
 * e-invoice.ts/zugferd.ts/peppol.ts) — German B2B companies have also been legally required to be
 * *able to receive* them since 2025-01-01.
 */
@Injectable()
export class IncomingEInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.incomingEInvoice.findMany({ where: { companyId }, include: INCLUDE, orderBy: { createdAt: "desc" } });
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  /**
   * Accepts either a raw e-invoice XML file or a ZUGFeRD hybrid PDF/A-3 — sniffed from the file's
   * own MIME type/extension, not trusted from a client-supplied hint. Never rejects a document
   * outright for failing EN 16931 core validation (see validateEn16931Core's own doc comment) —
   * those failures are recorded on the row for the reviewer to see, not a reason to refuse
   * staging it at all, since even a bill with data-quality problems still exists and needs
   * tracking.
   */
  async upload(companyId: string, actor: AuditActor, file: Express.Multer.File): Promise<{ id: string }> {
    const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    const isXml = file.mimetype === "application/xml" || file.mimetype === "text/xml" || file.originalname.toLowerCase().endsWith(".xml");
    if (!isPdf && !isXml) {
      throw new BadRequestException("Only a .xml e-invoice file or a ZUGFeRD/Factur-X PDF is accepted");
    }

    let xml: string;
    if (isPdf) {
      const extracted = await extractZugferdXmlFromPdf(file.buffer);
      if (!extracted) {
        throw new BadRequestException("No embedded e-invoice XML found in this PDF — it isn't a ZUGFeRD/Factur-X hybrid document");
      }
      xml = extracted;
    } else {
      xml = file.buffer.toString("utf-8");
    }

    const format = detectXmlFormat(xml, isPdf);
    const parsed = parseEInvoiceXml(xml, format);
    const validationErrors = validateEn16931Core(parsed);

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    const matchedSupplierId = parsed.seller?.vatId ? await this.findSupplierByVatId(companyId, parsed.seller.vatId) : null;

    const created = await this.prisma.incomingEInvoice.create({
      data: {
        companyId,
        format,
        status: matchedSupplierId ? "matched" : "pending_review",
        rawFileStorageKey: stored.storageKey,
        rawFileName: file.originalname,
        ...this.headerFields(parsed),
        validationErrors,
        supplierId: matchedSupplierId,
        lines: { create: parsed.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal, taxRatePercent: l.taxRatePercent })) },
      },
      include: INCLUDE,
    });

    this.audit.record(
      companyId,
      actor,
      "incoming_e_invoice.uploaded",
      "IncomingEInvoice",
      created.id,
      `Uploaded ${format} e-invoice "${parsed.invoiceNumber ?? file.originalname}"${matchedSupplierId ? ` — auto-matched to ${created.supplier?.name}` : ""}`,
    );
    return { id: created.id };
  }

  async getRawFile(companyId: string, id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const invoice = await this.findOrThrow(companyId, id);
    const buffer = await this.storage.read(invoice.rawFileStorageKey);
    return { buffer, fileName: invoice.rawFileName };
  }

  /** Manual override for when VAT-ID auto-matching (upload()) found no supplier, or found the
   * wrong one — e.g. the supplier hasn't been entered with a vatId yet. */
  async matchSupplier(companyId: string, actor: AuditActor, id: string, supplierId: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "converted") throw new BadRequestException("This e-invoice has already been converted to a bill");
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");

    const updated = await this.prisma.incomingEInvoice.update({
      where: { id },
      data: { supplierId, status: "matched" },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "incoming_e_invoice.matched", "IncomingEInvoice", id, `Matched to supplier ${supplier.name}`);
    return updated;
  }

  /** Turns the staged, matched e-invoice into a real VendorBill — the one place this module
   * actually commits to a payable. Requires supplierId to already be set, since
   * VendorBill.supplierId itself is a required (non-nullable) column. */
  async convertToVendorBill(companyId: string, actor: AuditActor, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "converted") throw new BadRequestException("This e-invoice has already been converted");
    if (invoice.status === "rejected") throw new BadRequestException("This e-invoice was rejected — it can't be converted");
    if (!invoice.supplierId) throw new BadRequestException("Match this e-invoice to a supplier before converting it");

    const vendorBill = await this.prisma.$transaction(async (tx) => {
      const bill = await tx.vendorBill.create({
        data: {
          companyId,
          supplierId: invoice.supplierId!,
          billNumber: invoice.invoiceNumber ?? invoice.rawFileName,
          billDate: invoice.issueDate ?? new Date(),
          dueDate: invoice.dueDate,
          notes: invoice.validationErrors.length > 0 ? `Imported from e-invoice with validation warnings: ${invoice.validationErrors.join("; ")}` : undefined,
          lines: {
            create: invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
          },
        },
      });
      await tx.incomingEInvoice.update({
        where: { id },
        data: { status: "converted", vendorBillId: bill.id, reviewedAt: new Date(), reviewedByName: actor.name },
      });
      return bill;
    });

    this.audit.record(companyId, actor, "incoming_e_invoice.converted", "IncomingEInvoice", id, `Converted to bill ${vendorBill.billNumber}`);
    return { vendorBillId: vendorBill.id };
  }

  async reject(companyId: string, actor: AuditActor, id: string, reason: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "converted") throw new BadRequestException("This e-invoice has already been converted — it can't be rejected");

    const updated = await this.prisma.incomingEInvoice.update({
      where: { id },
      data: { status: "rejected", rejectedReason: reason, reviewedAt: new Date(), reviewedByName: actor.name },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "incoming_e_invoice.rejected", "IncomingEInvoice", id, `Rejected: ${reason}`);
    return updated;
  }

  private async findSupplierByVatId(companyId: string, vatId: string): Promise<string | null> {
    const supplier = await this.prisma.supplier.findFirst({ where: { companyId, vatId } });
    return supplier?.id ?? null;
  }

  private headerFields(parsed: ParsedEInvoice) {
    return {
      invoiceNumber: parsed.invoiceNumber,
      issueDate: parsed.issueDate,
      dueDate: parsed.dueDate,
      currency: parsed.currency,
      sellerName: parsed.seller?.name,
      sellerVatId: parsed.seller?.vatId,
      sellerStreet: parsed.seller?.street,
      sellerCity: parsed.seller?.city,
      sellerPostalCode: parsed.seller?.postalCode,
      sellerCountryCode: parsed.seller?.countryCode,
      subtotal: parsed.subtotal,
      taxAmount: parsed.taxAmount,
      total: parsed.total,
    };
  }

  private async findOrThrow(companyId: string, id: string) {
    const invoice = await this.prisma.incomingEInvoice.findFirst({ where: { id, companyId }, include: INCLUDE });
    if (!invoice) throw new NotFoundException("Incoming e-invoice not found");
    return invoice;
  }
}
