import { NotFoundException } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { ClientDecisionInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { InvoicesService } from "../finance/invoices.service";
import type { PortalClientContext } from "./portal-jwt.service";

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estimates: EstimatesService,
    private readonly changeOrders: ChangeOrdersService,
    private readonly invoices: InvoicesService,
  ) {}

  async me(client: PortalClientContext) {
    const record = await this.prisma.client.findUniqueOrThrow({
      where: { id: client.clientId },
      include: { company: { select: { name: true, currency: true } } },
    });
    return { name: record.name, email: record.email, companyName: record.company.name, currency: record.company.currency };
  }

  listEstimates(client: PortalClientContext) {
    return this.prisma.estimate.findMany({
      where: { companyId: client.companyId, sentAt: { not: null }, project: { clientId: client.clientId } },
      select: {
        id: true,
        name: true,
        variantLabel: true,
        clientDecision: true,
        sentAt: true,
        decisionAt: true,
        grandTotal: true,
        project: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    });
  }

  async getEstimate(client: PortalClientContext, id: string) {
    const estimate = await this.findClientEstimate(client, id);
    return {
      id: estimate.id,
      name: estimate.name,
      variantLabel: estimate.variantLabel,
      clientDecision: estimate.clientDecision,
      decisionAt: estimate.decisionAt,
      clientDecisionNote: estimate.clientDecisionNote,
      signerName: estimate.signerName,
      hasSignature: !!estimate.signatureImageKey,
      companyName: estimate.company.name,
      currency: estimate.company.currency,
      projectName: estimate.project?.name ?? null,
      lines: estimate.lines.map((l) => ({
        id: l.id,
        description: l.rateCatalogItem.name,
        unit: l.rateCatalogItem.unit,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal: estimate.subtotal,
      markupAmount: estimate.markupAmount,
      taxAmount: estimate.taxAmount,
      grandTotal: estimate.grandTotal,
    };
  }

  async decideEstimate(client: PortalClientContext, id: string, input: ClientDecisionInput, signerIp?: string) {
    return this.estimates.decideForClient(client.companyId, client.clientId, id, input, signerIp);
  }

  async getEstimateSignature(client: PortalClientContext, id: string): Promise<Buffer> {
    await this.findClientEstimate(client, id);
    return this.estimates.getSignature(client.companyId, id);
  }

  async getEstimatePdf(client: PortalClientContext, id: string): Promise<Buffer> {
    await this.findClientEstimate(client, id);
    return this.estimates.generatePdf(client.companyId, id);
  }

  listChangeOrders(client: PortalClientContext) {
    return this.prisma.changeOrder.findMany({
      where: { companyId: client.companyId, sentAt: { not: null }, estimate: { project: { clientId: client.clientId } } },
      select: {
        id: true,
        number: true,
        title: true,
        clientDecision: true,
        sentAt: true,
        decisionAt: true,
        grandTotal: true,
        estimate: { select: { name: true } },
      },
      orderBy: { sentAt: "desc" },
    });
  }

  async getChangeOrder(client: PortalClientContext, id: string) {
    const co = await this.findClientChangeOrder(client, id);
    return {
      id: co.id,
      number: co.number,
      title: co.title,
      description: co.description,
      clientDecision: co.clientDecision,
      decisionAt: co.decisionAt,
      clientDecisionNote: co.clientDecisionNote,
      signerName: co.signerName,
      hasSignature: !!co.signatureImageKey,
      companyName: co.company.name,
      currency: co.company.currency,
      estimateName: co.estimate.name,
      lines: co.lines.map((l) => ({
        id: l.id,
        description: l.rateCatalogItem.name,
        unit: l.rateCatalogItem.unit,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal: co.subtotal,
      markupAmount: co.markupAmount,
      taxAmount: co.taxAmount,
      grandTotal: co.grandTotal,
    };
  }

  async decideChangeOrder(client: PortalClientContext, id: string, input: ClientDecisionInput, signerIp?: string) {
    return this.changeOrders.decideForClient(client.companyId, client.clientId, id, input, signerIp);
  }

  async getChangeOrderSignature(client: PortalClientContext, id: string): Promise<Buffer> {
    await this.findClientChangeOrder(client, id);
    return this.changeOrders.getSignature(client.companyId, id);
  }

  async getChangeOrderPdf(client: PortalClientContext, id: string): Promise<Buffer> {
    await this.findClientChangeOrder(client, id);
    return this.changeOrders.generatePdf(client.companyId, id);
  }

  listInvoices(client: PortalClientContext) {
    return this.prisma.invoice.findMany({
      where: { companyId: client.companyId, clientId: client.clientId, status: { not: "draft" } },
      select: { id: true, number: true, status: true, total: true, dueDate: true, createdAt: true, project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getInvoice(client: PortalClientContext, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId: client.companyId, clientId: client.clientId, status: { not: "draft" } },
      include: { lines: true, payments: true, installments: true, project: { select: { name: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  async getInvoicePdf(client: PortalClientContext, id: string): Promise<Buffer> {
    await this.getInvoice(client, id);
    return this.invoices.generatePdf(client.companyId, id);
  }

  private async findClientEstimate(client: PortalClientContext, id: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, companyId: client.companyId, sentAt: { not: null }, project: { clientId: client.clientId } },
      include: {
        lines: { orderBy: { sortOrder: "asc" }, include: { rateCatalogItem: true } },
        project: true,
        company: { select: { name: true, currency: true } },
      },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    return estimate;
  }

  private async findClientChangeOrder(client: PortalClientContext, id: string) {
    const co = await this.prisma.changeOrder.findFirst({
      where: { id, companyId: client.companyId, sentAt: { not: null }, estimate: { project: { clientId: client.clientId } } },
      include: {
        lines: { include: { rateCatalogItem: true }, orderBy: { sortOrder: "asc" } },
        estimate: { select: { name: true } },
        company: { select: { name: true, currency: true } },
      },
    });
    if (!co) throw new NotFoundException("Change order not found");
    return co;
  }
}
