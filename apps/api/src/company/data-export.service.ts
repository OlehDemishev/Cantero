import { Injectable } from "@nestjs/common";
import archiver from "archiver";
import { PrismaService } from "../common/prisma/prisma.service";

interface MembershipWithUser {
  role: string;
  emailDigestFrequency: string;
  user: { id: string; name: string; email: string };
}

/** Strips a membership's joined User down to the fields safe to hand back to the company — no password hash or internal-only columns. */
export function toTeamExportRow(membership: MembershipWithUser) {
  return {
    role: membership.role,
    emailDigestFrequency: membership.emailDigestFrequency,
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
  };
}

/**
 * GDPR Art. 20 (data portability) self-service export: a ZIP of JSON files, one per core
 * business entity, scoped to the requesting company. Covers company profile, team, CRM
 * contacts, projects, and the estimate/invoice/field-ops records tied to them — the data
 * a company (or an individual within it) would actually want a portable copy of. Deep
 * operational tables (stock movements, purchase orders, equipment, checklists, etc.) are
 * intentionally out of scope for this export; they don't carry personal data beyond what's
 * already covered via Users/Workers/Clients.
 */
@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExport(companyId: string): Promise<Buffer> {
    const [
      company,
      memberships,
      clients,
      projects,
      estimates,
      invoices,
      workers,
      timeEntries,
      documents,
      punchListItems,
      rfis,
      warrantyClaims,
      dailyLogs,
      incidentReports,
    ] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.membership.findMany({ where: { companyId }, include: { user: true } }),
      this.prisma.client.findMany({ where: { companyId } }),
      this.prisma.project.findMany({ where: { companyId } }),
      this.prisma.estimate.findMany({ where: { companyId }, include: { lines: true } }),
      this.prisma.invoice.findMany({ where: { companyId }, include: { lines: true, payments: true } }),
      this.prisma.worker.findMany({ where: { companyId } }),
      this.prisma.timeEntry.findMany({ where: { companyId } }),
      this.prisma.document.findMany({ where: { companyId, deletedAt: null }, select: { id: true, projectId: true, name: true, mimeType: true, size: true, category: true, createdAt: true } }),
      this.prisma.punchListItem.findMany({ where: { companyId } }),
      this.prisma.rfi.findMany({ where: { companyId } }),
      this.prisma.warrantyClaim.findMany({ where: { companyId } }),
      this.prisma.dailyLog.findMany({ where: { companyId } }),
      this.prisma.incidentReport.findMany({ where: { companyId } }),
    ]);

    const files: Record<string, unknown> = {
      "company.json": company,
      "team.json": memberships.map(toTeamExportRow),
      "clients.json": clients,
      "projects.json": projects,
      "estimates.json": estimates,
      "invoices.json": invoices,
      "workers.json": workers,
      "time-entries.json": timeEntries,
      "documents.json": documents,
      "punch-list.json": punchListItems,
      "rfis.json": rfis,
      "warranty-claims.json": warrantyClaims,
      "daily-logs.json": dailyLogs,
      "incident-reports.json": incidentReports,
    };

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });

    for (const [name, data] of Object.entries(files)) {
      archive.append(JSON.stringify(data, null, 2), { name });
    }

    archive.finalize();
    return done;
  }
}
