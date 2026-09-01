import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { ClientDecisionInput, EstimateClientDecisionInput, PortalCreateWarrantyClaimInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { InvoicesService } from "../finance/invoices.service";
import { ClientPaymentMethodsService } from "../finance/client-payment-methods.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { BillingService } from "../billing/billing.service";
import type { PortalClientContext } from "./portal-jwt.service";

function warrantyExpiresAt(handoverDate: Date | null, warrantyMonths: number | null): Date | null {
  if (!handoverDate || !warrantyMonths) return null;
  const expiry = new Date(handoverDate);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry;
}

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estimates: EstimatesService,
    private readonly changeOrders: ChangeOrdersService,
    private readonly invoices: InvoicesService,
    private readonly webhooks: WebhooksService,
    private readonly billing: BillingService,
    private readonly clientPaymentMethods: ClientPaymentMethodsService,
  ) {}

  async me(client: PortalClientContext) {
    const record = await this.prisma.client.findUniqueOrThrow({
      where: { id: client.clientId },
      include: { company: { select: { name: true, currency: true } } },
    });
    return {
      name: record.name,
      email: record.email,
      companyName: record.company.name,
      currency: record.company.currency,
      savedCardBrand: record.stripePaymentMethodBrand,
      savedCardLast4: record.stripePaymentMethodLast4,
    };
  }

  createPaymentMethodSetupSession(client: PortalClientContext) {
    return this.clientPaymentMethods.createSetupSession(client.companyId, client.clientId);
  }

  removePaymentMethod(client: PortalClientContext) {
    return this.clientPaymentMethods.removePaymentMethod(client.companyId, client.clientId);
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
      currency: estimate.currency,
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

  async decideEstimate(client: PortalClientContext, id: string, input: EstimateClientDecisionInput, signerIp?: string) {
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
      currency: co.estimate.currency,
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

  async createPaymentCheckout(client: PortalClientContext, id: string, amount?: number): Promise<{ url: string }> {
    await this.getInvoice(client, id);
    const record = await this.prisma.client.findUniqueOrThrow({ where: { id: client.clientId }, select: { email: true } });
    return this.billing.createInvoiceCheckoutSession(client.companyId, id, record.email ?? undefined, amount);
  }

  async listProjects(client: PortalClientContext) {
    const projects = await this.prisma.project.findMany({
      where: { companyId: client.companyId, clientId: client.clientId },
      select: { id: true, name: true, handoverDate: true, warrantyMonths: true },
      orderBy: { name: "asc" },
    });
    const now = new Date();
    return Promise.all(
      projects.map(async (p) => {
        const expiresAt = warrantyExpiresAt(p.handoverDate, p.warrantyMonths);
        return {
          ...p,
          warrantyExpiresAt: expiresAt,
          isUnderWarranty: expiresAt !== null && expiresAt > now,
          progress: await this.projectProgress(client.companyId, p.id),
        };
      }),
    );
  }

  /** Two simple, honest progress signals computed from data the client already sees elsewhere in
   * the portal — task completion from the team's own task board, and budget draw-down from paid
   * invoices against the approved estimate's contract sum. Either half is null when there's
   * nothing yet to compute it from (no tasks, or no approved estimate). */
  private async projectProgress(companyId: string, projectId: string) {
    const [taskCounts, contractSum, paidTotal] = await Promise.all([
      this.prisma.task.groupBy({ by: ["status"], where: { projectId }, _count: true }),
      this.prisma.estimate.aggregate({
        where: { companyId, projectId, isTemplate: false, status: "approved" },
        _sum: { grandTotal: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, projectId, status: "paid" },
        _sum: { total: true },
      }),
    ]);

    const totalTasks = taskCounts.reduce((sum, c) => sum + c._count, 0);
    const doneTasks = taskCounts.find((c) => c.status === "done")?._count ?? 0;

    const contractSumValue = Number(contractSum._sum.grandTotal ?? 0);
    const paidValue = Number(paidTotal._sum.total ?? 0);

    return {
      tasksTotal: totalTasks,
      tasksDone: doneTasks,
      taskPercent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null,
      budgetPercent: contractSumValue > 0 ? Math.round((paidValue / contractSumValue) * 100) : null,
    };
  }

  listWarrantyClaims(client: PortalClientContext) {
    return this.prisma.warrantyClaim.findMany({
      where: { companyId: client.companyId, project: { clientId: client.clientId } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async createWarrantyClaim(client: PortalClientContext, input: PortalCreateWarrantyClaimInput) {
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, companyId: client.companyId, clientId: client.clientId },
    });
    if (!project) throw new NotFoundException("Project not found");

    const expiresAt = warrantyExpiresAt(project.handoverDate, project.warrantyMonths);
    if (!expiresAt || expiresAt <= new Date()) {
      throw new BadRequestException("This project is not currently under warranty");
    }

    const clientRecord = await this.prisma.client.findUniqueOrThrow({ where: { id: client.clientId } });
    const claim = await this.prisma.warrantyClaim.create({
      data: {
        companyId: client.companyId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        location: input.location,
        submittedByClientId: client.clientId,
        submittedByName: clientRecord.name,
      },
    });
    this.webhooks.trigger(client.companyId, "warranty_claim.submitted", {
      warrantyClaimId: claim.id,
      title: claim.title,
      projectId: project.id,
    });
    return claim;
  }

  private async findClientEstimate(client: PortalClientContext, id: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, companyId: client.companyId, sentAt: { not: null }, project: { clientId: client.clientId } },
      include: {
        lines: { orderBy: { sortOrder: "asc" }, include: { rateCatalogItem: true } },
        project: true,
        company: { select: { name: true } },
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
        estimate: { select: { name: true, currency: true } },
        company: { select: { name: true } },
      },
    });
    if (!co) throw new NotFoundException("Change order not found");
    return co;
  }
}
