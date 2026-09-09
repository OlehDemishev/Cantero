import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import archiver, { type Archiver } from "archiver";
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

const EXPORT_PAGE_SIZE = 500;

/** Cursor-paginates through `fetchPage` (id-ascending, same shape as every other cursor-paginated
 * service in this app) and yields one NDJSON line per row, instead of a caller materializing the
 * whole table into an array first. Wrapped in Readable.from() and handed to archiver as a stream
 * source below, so a resource with 100k rows is read and zipped in ~EXPORT_PAGE_SIZE-row batches,
 * not held in memory all at once. NDJSON (one JSON object per line) rather than a single JSON
 * array is what makes that possible without hand-rolling streaming-array bracket/comma logic. */
async function* streamRows<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
): AsyncGenerator<string> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const row of page) yield JSON.stringify(row) + "\n";
    if (page.length < EXPORT_PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
}

/**
 * GDPR Art. 20 (data portability) self-service export: a ZIP of NDJSON files, one per core
 * business entity, scoped to the requesting company. Covers company profile, team, CRM
 * contacts, projects, and the estimate/invoice/field-ops records tied to them — the data
 * a company (or an individual within it) would actually want a portable copy of. Deep
 * operational tables (stock movements, purchase orders, equipment, checklists, etc.) are
 * intentionally out of scope for this export; they don't carry personal data beyond what's
 * already covered via Users/Workers/Clients.
 *
 * Streamed rather than buffered: the ZIP is written to the HTTP response as each resource's
 * pages come back from the database, so memory use stays roughly constant regardless of how
 * much history the company has accumulated, instead of growing with every table's full row
 * count the way a single buildExport()-then-send used to.
 */
@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExport(companyId: string): Promise<Archiver> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.append(JSON.stringify(company, null, 2), { name: "company.json" });

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.membership
            .findMany({
              where: { companyId },
              include: { user: true },
              orderBy: { id: "asc" },
              take: EXPORT_PAGE_SIZE,
              ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            })
            .then((rows) => rows.map((r) => ({ id: r.id, ...toTeamExportRow(r) }))),
        ),
      ),
      { name: "team.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.client.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "clients.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.project.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "projects.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.estimate.findMany({
            where: { companyId },
            include: { lines: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "estimates.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.invoice.findMany({
            where: { companyId },
            include: { lines: true, payments: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "invoices.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.worker.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "workers.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.timeEntry.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "time-entries.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.document.findMany({
            where: { companyId, deletedAt: null },
            select: { id: true, projectId: true, name: true, mimeType: true, size: true, category: true, createdAt: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "documents.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.punchListItem.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "punch-list.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.rfi.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "rfis.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.warrantyClaim.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "warranty-claims.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.dailyLog.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "daily-logs.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.incidentReport.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "incident-reports.ndjson" },
    );

    archive.finalize();
    return archive;
  }

  /**
   * A second, differently-scoped export: the business-critical operational data GDPR portability
   * deliberately leaves out (rate/material catalogs, change orders, subcontractors and their costs,
   * contracts, purchase orders). Not a claim of covering every table in the schema — deep
   * historical/audit tables (audit log, notifications, stock movements, etc.) are still out of
   * scope — but enough to actually reconstruct a company's core estimating/procurement setup
   * elsewhere, which is what "back up my data" usually means in practice. Streamed the same way
   * as buildExport() above.
   */
  buildOperationalExport(companyId: string): Archiver {
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.rateCatalogItem.findMany({
            where: { companyId },
            include: { materials: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "rate-catalog.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.materialCatalogItem.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "material-catalog.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.changeOrder.findMany({
            where: { companyId },
            include: { lines: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "change-orders.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.subcontractor.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "subcontractors.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.subcontractorCost.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "subcontractor-costs.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.contract.findMany({
            where: { companyId },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "contracts.ndjson" },
    );

    archive.append(
      Readable.from(
        streamRows((cursor) =>
          this.prisma.purchaseOrder.findMany({
            where: { companyId },
            include: { lines: true },
            orderBy: { id: "asc" },
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          }),
        ),
      ),
      { name: "purchase-orders.ndjson" },
    );

    archive.finalize();
    return archive;
  }
}
