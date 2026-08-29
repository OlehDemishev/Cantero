import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSubcontractorCostInput, RequestLienWaiverInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const LIEN_WAIVER_TYPE_LABELS: Record<string, string> = {
  conditional_progress: "Conditional waiver on progress payment",
  unconditional_progress: "Unconditional waiver on progress payment",
  conditional_final: "Conditional waiver on final payment",
  unconditional_final: "Unconditional waiver on final payment",
};

@Injectable()
export class SubcontractorCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.subcontractorCost.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { subcontractor: true, lienWaiver: true },
      orderBy: { incurredDate: "desc" },
    });
  }

  async create(companyId: string, input: CreateSubcontractorCostInput) {
    const subcontractor = await this.prisma.subcontractor.findFirst({
      where: { id: input.subcontractorId, companyId },
    });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    if (input.costCodeId) {
      const costCode = await this.prisma.costCode.findFirst({ where: { id: input.costCodeId, companyId } });
      if (!costCode) throw new NotFoundException("Cost code not found");
    }

    return this.prisma.subcontractorCost.create({
      data: {
        companyId,
        subcontractorId: input.subcontractorId,
        projectId: input.projectId,
        description: input.description,
        amount: input.amount,
        incurredDate: input.incurredDate ? new Date(input.incurredDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        costCodeId: input.costCodeId,
      },
      include: { subcontractor: true },
    });
  }

  /** Marking a cost paid also auto-requests an unconditional progress lien waiver, if one isn't
   * already on file — the whole point of collecting waivers is to have one for every payment, so
   * this saves the office a manual follow-up step for the common case. A final waiver still
   * needs the explicit isFinal request, since that's a judgment call this shouldn't make silently.
   * It also records a SubcontractorPayment — `paid` itself has no date and can't answer "which
   * calendar year did we pay this in" (see the model comment), which is what the payment ledger
   * is for (1099 totals, etc.). A cost marked paid twice would violate the implicit
   * one-payment-per-cost assumption here, but nothing currently allows re-marking an already-paid
   * cost, so that's not reachable. */
  async markPaid(companyId: string, actor: AuditActor, id: string) {
    const cost = await this.prisma.subcontractorCost.findFirst({ where: { id, companyId } });
    if (!cost) throw new NotFoundException("Subcontractor cost not found");
    const updated = await this.prisma.subcontractorCost.update({
      where: { id },
      data: { paid: true },
      include: { subcontractor: true },
    });

    await this.prisma.subcontractorPayment.create({
      data: {
        companyId,
        subcontractorId: cost.subcontractorId,
        subcontractorCostId: cost.id,
        amount: cost.amount,
      },
    });

    const existingWaiver = await this.prisma.lienWaiver.findUnique({ where: { subcontractorCostId: id } });
    if (!existingWaiver) {
      await this.requestLienWaiver(companyId, actor, id, { isFinal: false });
    }

    return updated;
  }

  /** Requests a lien waiver for this cost's payment — type (conditional/unconditional) is snapshotted from the cost's paid status right now, not re-derived later. */
  async requestLienWaiver(companyId: string, actor: AuditActor, costId: string, input: RequestLienWaiverInput) {
    const cost = await this.prisma.subcontractorCost.findFirst({
      where: { id: costId, companyId },
      include: { subcontractor: true },
    });
    if (!cost) throw new NotFoundException("Subcontractor cost not found");

    const existing = await this.prisma.lienWaiver.findUnique({ where: { subcontractorCostId: costId } });
    if (existing) throw new BadRequestException("A lien waiver already exists for this cost");

    const type = `${cost.paid ? "unconditional" : "conditional"}_${input.isFinal ? "final" : "progress"}` as const;

    const waiver = await this.prisma.lienWaiver.create({
      data: {
        companyId,
        projectId: cost.projectId,
        subcontractorId: cost.subcontractorId,
        subcontractorCostId: cost.id,
        type,
        amount: cost.amount,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "lien_waiver.requested",
      "LienWaiver",
      waiver.id,
      `Requested a ${LIEN_WAIVER_TYPE_LABELS[type]} from ${cost.subcontractor.name} for ${cost.amount}`,
    );
    return waiver;
  }

  getLienWaiver(companyId: string, costId: string) {
    return this.prisma.lienWaiver.findFirst({ where: { companyId, subcontractorCostId: costId } });
  }

  async getLienWaiverPdf(companyId: string, costId: string): Promise<Buffer> {
    const waiver = await this.prisma.lienWaiver.findFirst({
      where: { companyId, subcontractorCostId: costId },
      include: { subcontractor: true, project: true },
    });
    if (!waiver) throw new NotFoundException("No lien waiver on file for this cost");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const signatureImageBuffer = waiver.signatureImageKey ? await this.storage.read(waiver.signatureImageKey) : undefined;

    return this.pdfService.render({
      title: LIEN_WAIVER_TYPE_LABELS[waiver.type],
      subtitle: `${waiver.subcontractor.name} — ${waiver.project.name}`,
      meta: [
        { label: "Status", value: waiver.signedAt ? "Signed" : "Awaiting signature" },
        { label: "Currency", value: company.currency },
      ],
      tableHeader: ["Description", "Amount"],
      tableRows: [{ cells: [`Payment waived for work through ${waiver.requestedAt.toISOString().slice(0, 10)}`, waiver.amount.toString()] }],
      totals: [{ label: "Amount waived", value: `${waiver.amount} ${company.currency}`, emphasize: true }],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature:
        waiver.signedAt && waiver.signerName
          ? { imageBuffer: signatureImageBuffer, signerName: waiver.signerName, signedAt: waiver.signedAt }
          : undefined,
    });
  }
}
