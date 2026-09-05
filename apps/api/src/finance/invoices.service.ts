import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AddInstallmentInput, GenerateProgressInvoiceInput, RecordPaymentInput, ReleaseRetainageInput, UpdateInvoiceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { toCsv } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { calculateProgressDraw, round2 } from "./progress-billing";
import { buildXRechnungXml } from "./e-invoice";
import { calculateLateFee, daysOverdue } from "./late-fee";
import { documentPdfLabels } from "../common/pdf/pdf-labels";
import { invoiceSentEmail } from "../common/mail/client-mail-templates";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";
import { calculateFxSettlement } from "./fx-settlement";

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly webhooks: WebhooksService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  list(companyId: string) {
    return this.prisma.invoice.findMany({ where: { companyId }, include: { client: true, project: true } });
  }

  async get(companyId: string, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    return { ...invoice, lateFeeAccrued: await this.computeLateFeeAccrued(companyId, invoice) };
  }

  /** Live-computed, never stored — a company's rate can change, and a settled invoice shouldn't
   * keep accruing, so this is recalculated on every read rather than cached. Only ever billed for
   * real once chargeLateFee() adds it as an actual line. */
  private async computeLateFeeAccrued(
    companyId: string,
    invoice: { status: string; dueDate: Date | null; total: unknown; payments: { amount: unknown }[] },
  ): Promise<number> {
    if (invoice.status !== "sent" || !invoice.dueDate) return 0;
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { lateFeePercentPerMonth: true } });
    if (!company.lateFeePercentPerMonth) return 0;

    const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = Number(invoice.total) - paid;
    const overdue = daysOverdue(invoice.dueDate, new Date());
    return calculateLateFee(outstanding, overdue, Number(company.lateFeePercentPerMonth));
  }

  /** Locks in the currently-accrued late fee as a real InvoiceLine, so it actually gets billed —
   * chargeable multiple times as more time passes, each time adding only the newly-accrued
   * portion since the last charge (computed the same way, against the balance excluding
   * already-charged late-fee lines, so nothing double-counts). */
  async chargeLateFee(companyId: string, actor: AuditActor, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    const accrued = await this.computeLateFeeAccrued(companyId, invoice);
    if (accrued <= 0) {
      throw new BadRequestException("No late fee has accrued on this invoice");
    }

    await this.prisma.invoiceLine.create({
      data: { invoiceId: id, description: "Late fee", quantity: 1, unitPrice: accrued, lineTotal: accrued },
    });
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { total: { increment: accrued } },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
    this.audit.record(companyId, actor, "invoice.late_fee_charged", "Invoice", id, `Charged a ${accrued} late fee on invoice ${invoice.number}`);
    return updated;
  }

  /** Generates an Invoice + InvoiceLines pre-filled from an approved estimate's totals. */
  async generateFromEstimate(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId },
      include: { lines: true, project: true },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (!estimate.project) {
      throw new NotFoundException("Estimate has no project — templates can't be invoiced directly");
    }
    if (!estimate.project.clientId) {
      throw new NotFoundException("Project has no client — add a client before invoicing");
    }
    if (estimate.status !== "approved") {
      throw new NotFoundException("Estimate must be approved before it can be invoiced");
    }

    const invoiceCount = await this.prisma.invoice.count({ where: { companyId } });
    const number = `INV-${String(invoiceCount + 1).padStart(4, "0")}`;

    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: estimate.lines.map((l) => l.rateCatalogItemId) }, companyId },
    });
    const rateItemsById = Object.fromEntries(rateItems.map((ri) => [ri.id, ri]));

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId,
        projectId: estimate.project.id,
        clientId: estimate.project.clientId,
        estimateId: estimate.id,
        number,
        status: "draft",
        currency: estimate.currency,
        subtotal: estimate.subtotal.add(estimate.markupAmount),
        taxAmount: estimate.taxAmount,
        total: estimate.grandTotal,
        lines: {
          create: estimate.lines.map((line) => ({
            description: rateItemsById[line.rateCatalogItemId]?.name ?? line.rateCatalogItemId,
            quantity: line.quantity,
            unitPrice: line.quantity.isZero() ? 0 : line.lineTotal.div(line.quantity),
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: { lines: true, client: true, project: true },
    });

    return invoice;
  }

  /** Generates one progress-billing draw against an estimate, withholding retainage on the incremental amount billed since the last draw. */
  async generateProgressInvoice(companyId: string, estimateId: string, input: GenerateProgressInvoiceInput) {
    const estimate = await this.assertInvoiceableEstimate(companyId, estimateId);

    const lastDraw = await this.prisma.invoice.findFirst({
      where: { companyId, estimateId, isRetainageRelease: false, percentComplete: { not: null } },
      orderBy: { percentComplete: "desc" },
    });
    const previousPercent = lastDraw ? Number(lastDraw.percentComplete) : 0;
    if (input.percentComplete <= previousPercent) {
      throw new BadRequestException(`Percent complete must be greater than the last draw's ${previousPercent}%`);
    }

    const calc = calculateProgressDraw(Number(estimate.grandTotal), previousPercent, input.percentComplete, input.retainagePercent);
    const number = await this.nextInvoiceNumber(companyId);

    return this.prisma.invoice.create({
      data: {
        companyId,
        projectId: estimate.project!.id,
        clientId: estimate.project!.clientId!,
        estimateId: estimate.id,
        number,
        status: "draft",
        currency: estimate.currency,
        subtotal: calc.grossAmount,
        taxAmount: 0,
        total: calc.netAmount,
        percentComplete: input.percentComplete,
        retainagePercent: input.retainagePercent,
        retainageAmount: calc.retainageAmount,
        lines: {
          create: [
            {
              description: `Progress billing — ${previousPercent}% → ${input.percentComplete}% complete`,
              quantity: 1,
              unitPrice: calc.grossAmount,
              lineTotal: calc.grossAmount,
            },
          ],
        },
      },
      include: { lines: true, client: true, project: true },
    });
  }

  /** Pays out all retainage withheld across an estimate's progress draws in one final invoice. Can only be done once per estimate. */
  /** Retainage can be released in stages (e.g. half at substantial completion, the rest after
   * final punch-list/lien-waiver) — each call generates its own release invoice for `input.amount`,
   * capped at whatever's still held. Omitting amount releases everything still remaining, the
   * original all-or-nothing behavior, so a plain "release retainage" click still works unchanged. */
  async releaseRetainage(companyId: string, estimateId: string, input: ReleaseRetainageInput) {
    const estimate = await this.assertInvoiceableEstimate(companyId, estimateId);

    const [progressDraws, releaseInvoices] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, estimateId, isRetainageRelease: false } }),
      this.prisma.invoice.findMany({ where: { companyId, estimateId, isRetainageRelease: true } }),
    ]);
    const totalHeld = round2(progressDraws.reduce((sum, inv) => sum + Number(inv.retainageAmount), 0));
    const alreadyReleased = round2(releaseInvoices.reduce((sum, inv) => sum + Number(inv.total), 0));
    const remaining = round2(totalHeld - alreadyReleased);
    if (remaining <= 0) throw new BadRequestException("No retainage remains to release on this estimate");

    const amount = input.amount ?? remaining;
    if (amount > remaining) throw new BadRequestException(`Only ${remaining} of retainage remains to release`);

    const number = await this.nextInvoiceNumber(companyId);
    return this.prisma.invoice.create({
      data: {
        companyId,
        projectId: estimate.project!.id,
        clientId: estimate.project!.clientId!,
        estimateId: estimate.id,
        number,
        status: "draft",
        currency: estimate.currency,
        subtotal: amount,
        taxAmount: 0,
        total: amount,
        isRetainageRelease: true,
        lines: { create: [{ description: "Retainage release", quantity: 1, unitPrice: amount, lineTotal: amount }] },
      },
      include: { lines: true, client: true, project: true },
    });
  }

  async progressBillingSummary(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, estimateId, OR: [{ percentComplete: { not: null } }, { isRetainageRelease: true }] },
      orderBy: { createdAt: "asc" },
    });
    const progressDraws = invoices.filter((i) => !i.isRetainageRelease);
    const releaseInvoices = invoices.filter((i) => i.isRetainageRelease);
    const percentBilled = progressDraws.length ? Math.max(...progressDraws.map((i) => Number(i.percentComplete))) : 0;
    const totalRetainageHeld = round2(progressDraws.reduce((sum, i) => sum + Number(i.retainageAmount), 0));
    const retainageReleasedTotal = round2(releaseInvoices.reduce((sum, i) => sum + Number(i.total), 0));

    return {
      contractTotal: Number(estimate.grandTotal),
      percentBilled,
      totalBilledGross: round2(progressDraws.reduce((sum, i) => sum + Number(i.subtotal), 0)),
      totalRetainageHeld,
      retainageReleasedTotal,
      retainageRemaining: round2(totalRetainageHeld - retainageReleasedTotal),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        percentComplete: i.percentComplete !== null ? Number(i.percentComplete) : null,
        retainageAmount: Number(i.retainageAmount),
        total: Number(i.total),
        isRetainageRelease: i.isRetainageRelease,
      })),
    };
  }

  async send(companyId: string, actor: AuditActor, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be sent");
    }

    let dueDate = invoice.dueDate;
    if (!dueDate) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { defaultPaymentTermsDays: true } });
      const termsDays = invoice.client.paymentTermsDays ?? company.defaultPaymentTermsDays;
      dueDate = new Date(Date.now() + termsDays * 24 * 60 * 60 * 1000);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: "sent", dueDate },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
    this.audit.record(companyId, actor, "invoice.sent", "Invoice", id, `Sent invoice ${invoice.number} to ${invoice.client.name}`);
    this.webhooks.trigger(companyId, "invoice.sent", { invoiceId: id, number: invoice.number });

    if (updated.client.email) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const pdf = await this.generatePdf(companyId, id);
      const email = invoiceSentEmail(
        updated.client.preferredLocale ?? company.locale,
        company.name,
        updated.number,
        updated.total.toString(),
        updated.currency,
      );
      this.mail.send({
        to: updated.client.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [{ filename: `${updated.number}.pdf`, content: pdf, contentType: "application/pdf" }],
      });
    }

    return { ...updated, emailSentTo: updated.client.email ?? null };
  }

  async update(companyId: string, id: string, input: UpdateInvoiceInput) {
    await this.findOrThrow(companyId, id);
    return this.prisma.invoice.update({
      where: { id },
      data: { dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
  }

  /** Adds one row to the invoice's planned payment schedule — a plan only, not linked to actual Payment rows. */
  async addInstallment(companyId: string, id: string, input: AddInstallmentInput) {
    const invoice = await this.findOrThrow(companyId, id);
    await this.prisma.invoiceInstallment.create({
      data: {
        invoiceId: id,
        label: input.label,
        amount: input.amount,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        sortOrder: invoice.installments.length,
      },
    });
    return this.findOrThrow(companyId, id);
  }

  /** Records a payment and re-derives invoice status from the running balance. A foreignPayment
   * settles in a currency other than the invoice's own — see fx-settlement.ts. */
  async recordPayment(companyId: string, actor: AuditActor, id: string, input: RecordPaymentInput) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "draft") {
      throw new BadRequestException("Send the invoice before recording a payment against it");
    }
    if (invoice.status === "void") {
      throw new BadRequestException("Cannot record a payment against a void invoice");
    }

    let amount = input.amount ?? 0;
    let fxFields: { currency?: typeof invoice.currency; foreignAmount?: number; exchangeRate?: number; fxGainLoss?: number | null } = {};
    if (input.foreignPayment) {
      const benchmarkRate = await this.exchangeRates.getRate(input.foreignPayment.currency, invoice.currency);
      const settlement = calculateFxSettlement({
        foreignAmount: input.foreignPayment.foreignAmount,
        actualRate: input.foreignPayment.exchangeRate,
        benchmarkRate,
      });
      amount = settlement.convertedAmount;
      fxFields = {
        currency: input.foreignPayment.currency,
        foreignAmount: input.foreignPayment.foreignAmount,
        exchangeRate: input.foreignPayment.exchangeRate,
        fxGainLoss: settlement.gainLoss,
      };
    }

    await this.prisma.payment.create({
      data: { invoiceId: id, amount, method: input.method, ...fxFields },
    });

    const payments = await this.prisma.payment.findMany({ where: { invoiceId: id } });
    const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const newStatus = paidTotal >= Number(invoice.total) ? "paid" : "sent";

    this.audit.record(
      companyId,
      actor,
      "invoice.payment_recorded",
      "Invoice",
      id,
      `Recorded a ${amount} payment (${input.method}) on invoice ${invoice.number}`,
      { amount, method: input.method },
    );
    this.webhooks.trigger(companyId, "invoice.payment_recorded", {
      invoiceId: id,
      number: invoice.number,
      amount,
      method: input.method,
      newStatus,
    });

    return this.prisma.invoice.update({
      where: { id },
      data: { status: newStatus },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
  }

  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const labels = documentPdfLabels(invoice.client.preferredLocale ?? company.locale);

    return this.pdfService.render({
      title: `Invoice ${invoice.number}`,
      subtitle: `${invoice.client.name} — ${invoice.project.name}`,
      meta: [
        { label: labels.status, value: invoice.status },
        { label: labels.currency, value: invoice.currency },
      ],
      tableHeader: [labels.description, labels.qty, labels.unitPrice, labels.lineTotal],
      tableRows: invoice.lines.map((line) => ({
        cells: [line.description, line.quantity.toString(), line.unitPrice.toString(), line.lineTotal.toString()],
      })),
      totals: [
        { label: labels.subtotal, value: `${invoice.subtotal} ${invoice.currency}` },
        { label: labels.tax, value: `${invoice.taxAmount} ${invoice.currency}` },
        { label: labels.totalDue, value: `${invoice.total} ${invoice.currency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  /**
   * A UBL 2.1/XRechnung 3.0 e-invoice XML for this invoice (see buildXRechnungXml). Requires the
   * company's e-invoicing fields (address/city/postalCode/vatId) and the client's billing address
   * to be filled in first — throws a specific, actionable message naming exactly what's missing
   * rather than a generic validation failure.
   */
  async generateXRechnungXml(companyId: string, id: string): Promise<{ xml: string; filename: string }> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const missing: string[] = [];
    if (!company.address) missing.push("company street address");
    if (!company.city) missing.push("company city");
    if (!company.postalCode) missing.push("company postal code");
    if (!company.vatId) missing.push("company VAT ID");
    if (!invoice.client.street) missing.push("client street address");
    if (!invoice.client.city) missing.push("client city");
    if (!invoice.client.postalCode) missing.push("client postal code");
    if (!invoice.client.country) missing.push("client country");
    if (missing.length > 0) {
      throw new BadRequestException(
        `Can't generate an e-invoice — missing: ${missing.join(", ")}. Fill these in under company settings and the client's billing address first.`,
      );
    }

    const xml = buildXRechnungXml({
      invoiceNumber: invoice.number,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      seller: {
        name: company.name,
        street: company.address!,
        city: company.city!,
        postalCode: company.postalCode!,
        countryCode: company.country,
        vatId: company.vatId,
        iban: company.iban,
      },
      buyer: {
        name: invoice.client.name,
        street: invoice.client.street!,
        city: invoice.client.city!,
        postalCode: invoice.client.postalCode!,
        countryCode: invoice.client.country!,
        vatId: invoice.client.vatId,
      },
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
    });

    // Content-Disposition header values must be ASCII — an invoice number in another script
    // (e.g. "РАХ-2026-001") would otherwise throw ERR_INVALID_CHAR when the controller sets it.
    const asciiNumber = invoice.number.replace(/[^\x20-\x7e]/g, "_");
    return { xml, filename: `${asciiNumber}-xrechnung.xml` };
  }

  /** Accounting export: one row per invoice, with paid/outstanding derived from its payments. */
  async exportCsv(companyId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId },
      include: { client: true, project: true, payments: true },
      orderBy: { number: "asc" },
    });

    const header = [
      "Number",
      "Status",
      "Client",
      "Project",
      "Currency",
      "Subtotal",
      "Tax",
      "Total",
      "Paid",
      "Outstanding",
      "Due date",
      "Created date",
    ];
    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return [
        inv.number,
        inv.status,
        inv.client.name,
        inv.project.name,
        inv.currency,
        inv.subtotal.toString(),
        inv.taxAmount.toString(),
        inv.total.toString(),
        paid.toFixed(2),
        (Number(inv.total) - paid).toFixed(2),
        inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
        inv.createdAt.toISOString().slice(0, 10),
      ];
    });

    return toCsv(header, rows);
  }

  /**
   * QuickBooks Online's bulk-invoice-import CSV format (one row per invoice line, invoice
   * fields repeated per row — QBO groups rows back into one invoice by matching InvoiceNo).
   * "Item" is left as a generic "Services" placeholder — the importing user maps it to a real
   * QBO product/service item during import. Only sent/paid invoices are included; drafts aren't
   * real transactions yet, so they'd have nothing to import.
   */
  async exportQuickBooksCsv(companyId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: "draft" } },
      include: { client: true, lines: true },
      orderBy: { number: "asc" },
    });

    const header = ["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Item", "ItemDescription", "ItemQuantity", "ItemRate", "ItemAmount"];
    const rows = invoices.flatMap((inv) =>
      inv.lines.map((line) => [
        inv.number,
        inv.client.name,
        inv.createdAt.toISOString().slice(0, 10),
        (inv.dueDate ?? inv.createdAt).toISOString().slice(0, 10),
        "Services",
        line.description,
        line.quantity.toString(),
        line.unitPrice.toString(),
        line.lineTotal.toString(),
      ]),
    );
    return toCsv(header, rows);
  }

  /**
   * Xero's Sales Invoices import CSV format (one row per invoice line). AccountCode "200" is
   * Xero's default chart-of-accounts code for Sales in a standard chart — the importing user
   * remaps it if their chart differs. TaxType "NONE" leaves tax handling to Xero's own rules
   * rather than guessing a tax rate name that may not exist in the target organisation.
   */
  async exportXeroCsv(companyId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: "draft" } },
      include: { client: true, lines: true },
      orderBy: { number: "asc" },
    });

    const header = [
      "*ContactName",
      "*InvoiceNumber",
      "*InvoiceDate",
      "*DueDate",
      "*Description",
      "*Quantity",
      "*UnitAmount",
      "*AccountCode",
      "*TaxType",
      "Currency",
    ];
    const rows = invoices.flatMap((inv) =>
      inv.lines.map((line) => [
        inv.client.name,
        inv.number,
        inv.createdAt.toISOString().slice(0, 10),
        (inv.dueDate ?? inv.createdAt).toISOString().slice(0, 10),
        line.description,
        line.quantity.toString(),
        line.unitPrice.toString(),
        "200",
        "NONE",
        inv.currency,
      ]),
    );
    return toCsv(header, rows);
  }

  private async assertInvoiceableEstimate(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId }, include: { project: true } });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (!estimate.project) throw new NotFoundException("Estimate has no project — templates can't be invoiced directly");
    if (!estimate.project.clientId) throw new NotFoundException("Project has no client — add a client before invoicing");
    if (estimate.status !== "approved") throw new NotFoundException("Estimate must be approved before it can be invoiced");
    return estimate;
  }

  private async nextInvoiceNumber(companyId: string): Promise<string> {
    const invoiceCount = await this.prisma.invoice.count({ where: { companyId } });
    return `INV-${String(invoiceCount + 1).padStart(4, "0")}`;
  }

  private async findOrThrow(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        lines: true,
        client: true,
        project: true,
        payments: true,
        installments: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }
}
