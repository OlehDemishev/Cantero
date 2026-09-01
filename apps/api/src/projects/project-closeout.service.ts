import { Injectable, NotFoundException } from "@nestjs/common";
import archiver from "archiver";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { InvoicesService } from "../finance/invoices.service";
import { DocumentsService } from "../documents/documents.service";

/** Builds the client-handoff ZIP: a closeout summary PDF, the project's latest invoice PDF, and its stored documents. */
@Injectable()
export class ProjectCloseoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly invoices: InvoicesService,
    private readonly documents: DocumentsService,
  ) {}

  async buildPackage(companyId: string, projectId: string): Promise<Buffer> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const [punchListItems, rfis, warrantyClaims, projectInvoices, projectDocuments] = await Promise.all([
      this.prisma.punchListItem.findMany({ where: { projectId, companyId }, orderBy: { createdAt: "asc" } }),
      this.prisma.rfi.findMany({ where: { projectId, companyId }, orderBy: { createdAt: "asc" } }),
      this.prisma.warrantyClaim.findMany({ where: { projectId, companyId }, orderBy: { createdAt: "asc" } }),
      this.prisma.invoice.findMany({ where: { projectId, companyId }, orderBy: { createdAt: "desc" } }),
      this.documents.list(companyId, { projectId }),
    ]);

    const summaryPdf = await this.buildSummaryPdf(project, company, punchListItems, rfis, warrantyClaims, projectInvoices);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });

    archive.append(summaryPdf, { name: "closeout-summary.pdf" });

    const latestInvoice = projectInvoices[0];
    if (latestInvoice) {
      const invoicePdf = await this.invoices.generatePdf(companyId, latestInvoice.id);
      archive.append(invoicePdf, { name: `invoice-${latestInvoice.number}.pdf` });
    }

    const usedNames = new Set<string>();
    for (const doc of projectDocuments) {
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

  private async buildSummaryPdf(
    project: { name: string; address: string | null; handoverDate: Date | null; warrantyMonths: number | null; client: { name: string } | null },
    company: { currency: string; logoStorageKey: string | null; brandColor: string | null },
    punchListItems: { title: string; status: string; createdAt: Date; resolvedAt: Date | null; verifiedAt: Date | null }[],
    rfis: { number: string; subject: string; status: string; createdAt: Date; closedAt: Date | null; answeredAt: Date | null }[],
    warrantyClaims: { title: string; status: string; createdAt: Date; resolvedAt: Date | null }[],
    invoices: { total: unknown; status: string; currency: string }[],
  ): Promise<Buffer> {
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;

    const openPunchList = punchListItems.filter((p) => p.status !== "verified").length;
    const openRfis = rfis.filter((r) => r.status !== "closed").length;
    const openWarrantyClaims = warrantyClaims.filter((w) => w.status === "open" || w.status === "in_progress").length;
    const totalInvoiced = invoices
      .filter((i) => i.status !== "void")
      .reduce((sum, i) => sum + Number(i.total), 0);
    // All of a project's invoices are expected to share one currency (see Invoice.currency) — the
    // first invoice's is used as the label rather than the company default, so a project billed
    // in an override currency doesn't get its total mislabeled.
    const invoicedCurrency = invoices[0]?.currency ?? company.currency;

    const warrantyExpires = project.handoverDate && project.warrantyMonths != null
      ? new Date(project.handoverDate.getTime())
      : null;
    if (warrantyExpires && project.warrantyMonths != null) {
      warrantyExpires.setMonth(warrantyExpires.getMonth() + project.warrantyMonths);
    }

    const rows = [
      ...punchListItems.map((p) => ({
        cells: ["Punch list", p.title, p.status, (p.verifiedAt ?? p.resolvedAt ?? p.createdAt).toISOString().slice(0, 10)],
      })),
      ...rfis.map((r) => ({
        cells: ["RFI", `${r.number} — ${r.subject}`, r.status, (r.closedAt ?? r.answeredAt ?? r.createdAt).toISOString().slice(0, 10)],
      })),
      ...warrantyClaims.map((w) => ({
        cells: ["Warranty claim", w.title, w.status, (w.resolvedAt ?? w.createdAt).toISOString().slice(0, 10)],
      })),
    ];

    return this.pdfService.render({
      title: "Project Closeout Package",
      subtitle: project.client ? `${project.name} — ${project.client.name}` : project.name,
      meta: [
        ...(project.address ? [{ label: "Address", value: project.address }] : []),
        { label: "Handover date", value: project.handoverDate ? project.handoverDate.toISOString().slice(0, 10) : "Not set" },
        { label: "Warranty expires", value: warrantyExpires ? warrantyExpires.toISOString().slice(0, 10) : "Not set" },
      ],
      tableHeader: ["Type", "Reference", "Status", "Date"],
      tableRows: rows,
      totals: [
        { label: "Open punch list items", value: String(openPunchList) },
        { label: "Open RFIs", value: String(openRfis) },
        { label: "Open warranty claims", value: String(openWarrantyClaims) },
        { label: "Total invoiced", value: `${totalInvoiced.toFixed(2)} ${invoicedCurrency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }
}
