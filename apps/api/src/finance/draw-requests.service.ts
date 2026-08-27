import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import archiver from "archiver";
import type { CreateDrawRequestInput, DrawRequestStatus } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { AiaBillingService } from "./aia-billing.service";

const STATUS_TIMESTAMP_FIELD: Partial<Record<DrawRequestStatus, "submittedAt" | "approvedAt" | "fundedAt">> = {
  submitted: "submittedAt",
  approved: "approvedAt",
  funded: "fundedAt",
};

/**
 * The bank/lender-facing wrapper around a progress-billing Invoice — see DrawRequest's schema
 * doc comment for why this is a separate model rather than fields on Invoice. Reuses the
 * existing progress-billing math (InvoicesService), schedule-of-values PDF (AiaBillingService),
 * and the ZIP-bundling approach already proven by ProjectCloseoutService rather than building any
 * of those from scratch.
 */
@Injectable()
export class DrawRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly aiaBilling: AiaBillingService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.drawRequest.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { invoice: true },
      orderBy: [{ projectId: "asc" }, { drawNumber: "asc" }],
    });
  }

  async get(companyId: string, id: string) {
    const draw = await this.prisma.drawRequest.findFirst({ where: { id, companyId }, include: { invoice: true } });
    if (!draw) throw new NotFoundException("Draw request not found");
    return draw;
  }

  async create(companyId: string, actor: AuditActor, input: CreateDrawRequestInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const invoice = await this.prisma.invoice.findFirst({ where: { id: input.invoiceId, companyId, projectId: input.projectId } });
    if (!invoice) throw new NotFoundException("Invoice not found on this project");
    if (invoice.percentComplete === null) {
      throw new BadRequestException("Only a progress-billing draw invoice can be wrapped in a draw request");
    }
    const existing = await this.prisma.drawRequest.findUnique({ where: { invoiceId: input.invoiceId } });
    if (existing) throw new BadRequestException("This invoice already has a draw request");

    const lastDraw = await this.prisma.drawRequest.findFirst({ where: { projectId: input.projectId }, orderBy: { drawNumber: "desc" } });
    const drawNumber = (lastDraw?.drawNumber ?? 0) + 1;

    const draw = await this.prisma.drawRequest.create({
      data: {
        companyId,
        projectId: input.projectId,
        invoiceId: input.invoiceId,
        drawNumber,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        lenderName: input.lenderName,
        lenderContactEmail: input.lenderContactEmail,
        notes: input.notes,
      },
      include: { invoice: true },
    });
    this.audit.record(companyId, actor, "draw_request.created", "DrawRequest", draw.id, `Created draw #${drawNumber} on "${project.name}"`);
    return draw;
  }

  async updateStatus(companyId: string, actor: AuditActor, id: string, status: DrawRequestStatus) {
    const draw = await this.get(companyId, id);
    const timestampField = STATUS_TIMESTAMP_FIELD[status];

    const updated = await this.prisma.drawRequest.update({
      where: { id: draw.id },
      data: { status, ...(timestampField ? { [timestampField]: new Date() } : {}) },
      include: { invoice: true },
    });
    this.audit.record(companyId, actor, "draw_request.status_changed", "DrawRequest", draw.id, `Draw #${draw.drawNumber} marked ${status}`);
    return updated;
  }

  /**
   * Bundles everything a lender expects in one package: a cover sheet, the schedule of values,
   * every signed lien waiver for subcontractor work incurred in the draw's period, and any
   * documents (photos, invoice scans) attached directly to the draw's invoice — same archiver
   * pattern as ProjectCloseoutService.buildPackage, different source data.
   */
  async buildPackage(companyId: string, id: string): Promise<Buffer> {
    const draw = await this.prisma.drawRequest.findFirst({
      where: { id, companyId },
      include: { invoice: { include: { project: true, client: true } } },
    });
    if (!draw) throw new NotFoundException("Draw request not found");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const [lienWaivers, invoiceDocuments] = await Promise.all([
      this.prisma.lienWaiver.findMany({
        where: {
          companyId,
          projectId: draw.projectId,
          signedAt: { not: null },
          subcontractorCost: { incurredDate: { gte: draw.periodStart, lte: draw.periodEnd } },
        },
        include: { subcontractor: true },
      }),
      this.prisma.document.findMany({ where: { companyId, invoiceId: draw.invoiceId, deletedAt: null } }),
    ]);

    const coverPdf = await this.buildCoverSheetPdf(draw, company);
    const scheduleOfValuesPdf = await this.aiaBilling.generatePdf(companyId, draw.invoiceId);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });

    archive.append(coverPdf, { name: `draw-${draw.drawNumber}-cover-sheet.pdf` });
    archive.append(scheduleOfValuesPdf, { name: `draw-${draw.drawNumber}-schedule-of-values.pdf` });

    for (const waiver of lienWaivers) {
      const waiverPdf = await this.buildLienWaiverPdf(waiver, company);
      archive.append(waiverPdf, { name: `lien-waivers/${waiver.subcontractor.name.replace(/[^a-z0-9]+/gi, "-")}-${waiver.id.slice(0, 8)}.pdf` });
    }

    const usedNames = new Set<string>();
    for (const doc of invoiceDocuments) {
      let name = doc.name;
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf(".");
        name = dot === -1 ? `${name}-${doc.id.slice(0, 8)}` : `${name.slice(0, dot)}-${doc.id.slice(0, 8)}${name.slice(dot)}`;
      }
      usedNames.add(name);
      const buffer = await this.storage.read(doc.storageKey);
      archive.append(buffer, { name: `documents/${name}` });
    }

    archive.finalize();
    return done;
  }

  private async buildCoverSheetPdf(
    draw: {
      drawNumber: number;
      periodStart: Date;
      periodEnd: Date;
      status: string;
      lenderName: string | null;
      lenderContactEmail: string | null;
      notes: string | null;
      invoice: { number: string; total: unknown; percentComplete: unknown; retainageAmount: unknown; project: { name: string }; client: { name: string } };
    },
    company: { name: string; currency: string; logoStorageKey: string | null; brandColor: string | null },
  ): Promise<Buffer> {
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;

    return this.pdf.render({
      title: `Draw Request #${draw.drawNumber}`,
      subtitle: `${draw.invoice.project.name} — ${draw.invoice.client.name}`,
      meta: [
        { label: "Period", value: `${draw.periodStart.toISOString().slice(0, 10)} – ${draw.periodEnd.toISOString().slice(0, 10)}` },
        { label: "Status", value: draw.status.replace(/_/g, " ") },
        { label: "Lender", value: draw.lenderName ?? "—" },
        { label: "Lender contact", value: draw.lenderContactEmail ?? "—" },
        { label: "Invoice", value: draw.invoice.number },
      ],
      tableHeader: ["Item", "Value"],
      tableRows: [
        { cells: ["% complete", `${Number(draw.invoice.percentComplete)}%`] },
        { cells: ["Retainage withheld this draw", `${Number(draw.invoice.retainageAmount)} ${company.currency}`] },
        ...(draw.notes ? [{ cells: ["Notes", draw.notes] }] : []),
      ],
      totals: [{ label: "Amount requested", value: `${Number(draw.invoice.total)} ${company.currency}`, emphasize: true }],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  private async buildLienWaiverPdf(
    waiver: {
      type: string;
      amount: unknown;
      requestedAt: Date;
      signedAt: Date | null;
      signerName: string | null;
      signatureImageKey: string | null;
      subcontractor: { name: string };
    },
    company: { currency: string; logoStorageKey: string | null; brandColor: string | null },
  ): Promise<Buffer> {
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;
    const signatureImageBuffer = waiver.signatureImageKey ? await this.storage.read(waiver.signatureImageKey).catch(() => undefined) : undefined;

    return this.pdf.render({
      title: waiver.type.replace(/_/g, " "),
      subtitle: waiver.subcontractor.name,
      meta: [{ label: "Requested", value: waiver.requestedAt.toISOString().slice(0, 10) }],
      tableHeader: ["Description", "Amount"],
      tableRows: [{ cells: ["Payment waived", `${Number(waiver.amount)} ${company.currency}`] }],
      totals: [{ label: "Amount waived", value: `${Number(waiver.amount)} ${company.currency}`, emphasize: true }],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature:
        waiver.signedAt && waiver.signerName ? { imageBuffer: signatureImageBuffer, signerName: waiver.signerName, signedAt: waiver.signedAt } : undefined,
    });
  }
}
