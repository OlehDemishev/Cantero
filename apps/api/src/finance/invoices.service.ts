import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { RecordPaymentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
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
    if (!estimate.project.clientId) {
      throw new NotFoundException("Project has no client — add a client before invoicing");
    }
    if (estimate.status !== "approved") {
      throw new NotFoundException("Estimate must be approved before it can be invoiced");
    }

    const invoiceCount = await this.prisma.invoice.count({ where: { companyId } });
    const number = `INV-${String(invoiceCount + 1).padStart(4, "0")}`;

    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: estimate.lines.map((l) => l.rateCatalogItemId) } },
    });
    const rateItemsById = Object.fromEntries(rateItems.map((ri) => [ri.id, ri]));

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId,
        projectId: estimate.projectId,
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

  async send(companyId: string, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be sent");
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: "sent" },
      include: { lines: true, client: true, project: true, payments: true },
    });
  }

  /** Records a payment and re-derives invoice status from the running balance. */
  async recordPayment(companyId: string, id: string, input: RecordPaymentInput) {
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

    return this.prisma.invoice.update({
      where: { id },
      data: { status: newStatus },
      include: { lines: true, client: true, project: true, payments: true },
    });
  }

  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

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
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: { lines: true, client: true, project: true, payments: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }
}
