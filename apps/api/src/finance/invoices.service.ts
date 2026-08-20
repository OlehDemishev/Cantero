import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AddInstallmentInput, RecordPaymentInput, UpdateInvoiceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { toCsv } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  list(companyId: string) {
    return this.prisma.invoice.findMany({ where: { companyId }, include: { client: true, project: true } });
  }

  async get(companyId: string, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    return invoice;
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

  async send(companyId: string, actor: AuditActor, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be sent");
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: "sent" },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
    this.audit.record(companyId, actor, "invoice.sent", "Invoice", id, `Sent invoice ${invoice.number} to ${invoice.client.name}`);

    if (updated.client.email) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const pdf = await this.generatePdf(companyId, id);
      this.mail.send({
        to: updated.client.email,
        subject: `Invoice ${updated.number} from ${company.name}`,
        html: `<p>${company.name} has sent you invoice <strong>${updated.number}</strong> for ${updated.total} ${company.currency}.</p><p>The invoice is attached as a PDF.</p>`,
        text: `${company.name} has sent you invoice ${updated.number} for ${updated.total} ${company.currency}. The invoice is attached as a PDF.`,
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

  /** Records a payment and re-derives invoice status from the running balance. */
  async recordPayment(companyId: string, actor: AuditActor, id: string, input: RecordPaymentInput) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "draft") {
      throw new BadRequestException("Send the invoice before recording a payment against it");
    }
    if (invoice.status === "void") {
      throw new BadRequestException("Cannot record a payment against a void invoice");
    }

    await this.prisma.payment.create({
      data: { invoiceId: id, amount: input.amount, method: input.method },
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
      `Recorded a ${input.amount} payment (${input.method}) on invoice ${invoice.number}`,
      { amount: input.amount, method: input.method },
    );

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

    return this.pdfService.render({
      title: `Invoice ${invoice.number}`,
      subtitle: `${invoice.client.name} — ${invoice.project.name}`,
      meta: [
        { label: "Status", value: invoice.status },
        { label: "Currency", value: company.currency },
      ],
      tableHeader: ["Description", "Qty", "Unit price", "Line total"],
      tableRows: invoice.lines.map((line) => ({
        cells: [line.description, line.quantity.toString(), line.unitPrice.toString(), line.lineTotal.toString()],
      })),
      totals: [
        { label: "Subtotal", value: `${invoice.subtotal} ${company.currency}` },
        { label: "Tax", value: `${invoice.taxAmount} ${company.currency}` },
        { label: "Total due", value: `${invoice.total} ${company.currency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
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
