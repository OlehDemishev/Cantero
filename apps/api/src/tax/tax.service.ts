import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateTaxExemptionCertificateInput,
  CreateTaxJurisdictionInput,
  CreateTaxRateInput,
  SetClientTaxJurisdictionInput,
  UpdateTaxJurisdictionInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateTax, findActiveRate } from "./tax-calc";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listJurisdictions(companyId: string) {
    return this.prisma.taxJurisdiction.findMany({
      where: { companyId },
      include: { rates: { orderBy: { effectiveFrom: "desc" } } },
      orderBy: { name: "asc" },
    });
  }

  async createJurisdiction(companyId: string, actor: AuditActor, input: CreateTaxJurisdictionInput) {
    const jurisdiction = await this.prisma.taxJurisdiction.create({
      data: { companyId, name: input.name, country: input.country, region: input.region },
    });
    this.audit.record(companyId, actor, "tax_jurisdiction.created", "TaxJurisdiction", jurisdiction.id, `Added tax jurisdiction "${input.name}"`);
    return jurisdiction;
  }

  async updateJurisdiction(companyId: string, actor: AuditActor, id: string, input: UpdateTaxJurisdictionInput) {
    const existing = await this.findJurisdictionOrThrow(companyId, id);
    const updated = await this.prisma.taxJurisdiction.update({
      where: { id },
      data: { name: input.name, country: input.country, region: input.region, active: input.active },
    });
    this.audit.record(companyId, actor, "tax_jurisdiction.updated", "TaxJurisdiction", id, `Updated tax jurisdiction "${existing.name}"`);
    return updated;
  }

  async addRate(companyId: string, actor: AuditActor, jurisdictionId: string, input: CreateTaxRateInput) {
    const jurisdiction = await this.findJurisdictionOrThrow(companyId, jurisdictionId);
    const rate = await this.prisma.taxRate.create({
      data: {
        companyId,
        jurisdictionId,
        ratePercent: input.ratePercent,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      },
    });
    this.audit.record(companyId, actor, "tax_rate.added", "TaxRate", rate.id, `Added ${input.ratePercent}% rate for "${jurisdiction.name}"`);
    return rate;
  }

  listExemptionCertificates(companyId: string, clientId: string) {
    return this.prisma.taxExemptionCertificate.findMany({ where: { companyId, clientId }, orderBy: { createdAt: "desc" } });
  }

  async addExemptionCertificate(companyId: string, actor: AuditActor, clientId: string, input: CreateTaxExemptionCertificateInput) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, companyId } });
    if (!client) throw new NotFoundException("Client not found");
    const cert = await this.prisma.taxExemptionCertificate.create({
      data: {
        companyId,
        clientId,
        certificateNumber: input.certificateNumber,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
    this.audit.record(companyId, actor, "tax_exemption_certificate.added", "TaxExemptionCertificate", cert.id, `Added exemption certificate for ${client.name}`);
    return cert;
  }

  async setClientJurisdiction(companyId: string, actor: AuditActor, clientId: string, input: SetClientTaxJurisdictionInput) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, companyId } });
    if (!client) throw new NotFoundException("Client not found");
    if (input.taxJurisdictionId) await this.findJurisdictionOrThrow(companyId, input.taxJurisdictionId);
    const updated = await this.prisma.client.update({ where: { id: clientId }, data: { taxJurisdictionId: input.taxJurisdictionId } });
    this.audit.record(companyId, actor, "client.tax_jurisdiction_set", "Client", clientId, `Set tax jurisdiction for ${client.name}`);
    return updated;
  }

  /**
   * Recomputes an invoice's tax from its client's jurisdiction (or the invoice's own already-set
   * jurisdiction, if it has one) and a live exemption check — not a background job, called
   * explicitly (e.g. after the client's jurisdiction or an exemption certificate changes). The
   * jurisdiction actually used is snapshotted onto the invoice so later edits to the client don't
   * retroactively change an already-issued invoice's tax basis.
   */
  async recalculateInvoiceTax(companyId: string, actor: AuditActor, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { client: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.percentComplete != null || invoice.isRetainageRelease) {
      throw new BadRequestException(
        "Progress-billing draws and retainage releases are billed against the estimate's grandTotal, which already includes tax — recalculating tax here would double it and discard the retainage withholding",
      );
    }

    const jurisdictionId = invoice.taxJurisdictionId ?? invoice.client.taxJurisdictionId;
    let rate = null as Awaited<ReturnType<typeof findActiveRate>>;
    if (jurisdictionId) {
      const rates = await this.prisma.taxRate.findMany({ where: { companyId, jurisdictionId } });
      rate = findActiveRate(
        rates.map((r) => ({ ratePercent: Number(r.ratePercent), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo })),
        invoice.createdAt,
      );
    }

    const exemption = await this.prisma.taxExemptionCertificate.findFirst({
      where: { companyId, clientId: invoice.clientId, OR: [{ expiresAt: null }, { expiresAt: { gt: invoice.createdAt } }] },
    });

    const { taxAmount } = calculateTax({ subtotal: Number(invoice.subtotal), rate, isExempt: !!exemption });
    const total = round2(Number(invoice.subtotal) + taxAmount);

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { taxAmount, total, taxJurisdictionId: jurisdictionId },
    });
    this.audit.record(companyId, actor, "invoice.tax_recalculated", "Invoice", invoiceId, `Recalculated tax for invoice ${invoice.number}: ${taxAmount}`);
    return updated;
  }

  /** Sums taxAmount/subtotal for invoices billed to a jurisdiction within a period — the figure a
   * bookkeeper needs when filing a sales/use tax return. */
  async taxLiabilityReport(companyId: string, jurisdictionId: string, periodStart: Date, periodEnd: Date) {
    await this.findJurisdictionOrThrow(companyId, jurisdictionId);
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, taxJurisdictionId: jurisdictionId, createdAt: { gte: periodStart, lt: periodEnd }, status: { not: "draft" } },
      select: { number: true, subtotal: true, taxAmount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const totalTaxableSales = round2(invoices.reduce((sum, i) => sum + Number(i.subtotal), 0));
    const totalTaxCollected = round2(invoices.reduce((sum, i) => sum + Number(i.taxAmount), 0));
    return { invoices, totalTaxableSales, totalTaxCollected };
  }

  private async findJurisdictionOrThrow(companyId: string, id: string) {
    const jurisdiction = await this.prisma.taxJurisdiction.findFirst({ where: { id, companyId } });
    if (!jurisdiction) throw new NotFoundException("Tax jurisdiction not found");
    return jurisdiction;
  }
}
