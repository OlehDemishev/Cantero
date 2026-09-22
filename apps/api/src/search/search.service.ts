import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

export type SearchResultType =
  | "project"
  | "client"
  | "invoice"
  | "estimate"
  | "document"
  | "worker"
  | "supplier"
  | "rfi"
  | "punch_list_item"
  | "submittal"
  | "incident_report"
  | "warranty_claim";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** Substring search across the company. Anything belonging to a restricted project the user
   * isn't a member of is left out (projects, and the RFIs/punch items/… inside them). */
  async search(companyId: string, query: string, userId?: string, role?: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return [];

    const contains = { contains: q, mode: "insensitive" as const };

    const [projects, clients, invoices, estimates, documents, workers, suppliers, rfis, punchListItems, submittals, incidents, warrantyClaims] =
      await Promise.all([
        this.prisma.project.findMany({
          where: { companyId, name: contains },
          take: RESULTS_PER_TYPE,
          orderBy: { name: "asc" },
        }),
        this.prisma.client.findMany({
          where: { companyId, OR: [{ name: contains }, { email: contains }] },
          take: RESULTS_PER_TYPE,
          orderBy: { name: "asc" },
        }),
        this.prisma.invoice.findMany({
          where: { companyId, number: contains },
          include: { client: true },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.estimate.findMany({
          where: { companyId, isTemplate: false, name: contains },
          include: { project: true },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.document.findMany({
          where: { companyId, deletedAt: null, name: contains },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.worker.findMany({
          where: { companyId, name: contains },
          take: RESULTS_PER_TYPE,
          orderBy: { name: "asc" },
        }),
        this.prisma.supplier.findMany({
          where: { companyId, name: contains },
          take: RESULTS_PER_TYPE,
          orderBy: { name: "asc" },
        }),
        this.prisma.rfi.findMany({
          where: { companyId, subject: contains },
          include: { project: { select: { id: true, name: true } } },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.punchListItem.findMany({
          where: { companyId, title: contains },
          include: { project: { select: { id: true, name: true } } },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.submittal.findMany({
          where: { companyId, title: contains },
          include: { project: { select: { id: true, name: true } } },
          take: RESULTS_PER_TYPE * 2, // over-fetched, then deduped to the latest revision per chain below
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.incidentReport.findMany({
          where: { companyId, OR: [{ description: contains }, { location: contains }] },
          include: { project: { select: { id: true, name: true } } },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.warrantyClaim.findMany({
          where: { companyId, title: contains },
          include: { project: { select: { id: true, name: true } } },
          take: RESULTS_PER_TYPE,
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // A revision chain can match on more than one row (revise() copies the title forward) — keep
    // only the latest revision per chain so search doesn't show the same submittal twice.
    const latestSubmittalByChain = new Map<string, (typeof submittals)[number]>();
    for (const s of submittals) {
      const chainKey = s.rootSubmittalId ?? s.id;
      const existing = latestSubmittalByChain.get(chainKey);
      if (!existing || s.revision > existing.revision) latestSubmittalByChain.set(chainKey, s);
    }
    const dedupedSubmittals = Array.from(latestSubmittalByChain.values()).slice(0, RESULTS_PER_TYPE);

    const results: (SearchResult & { projectId?: string })[] = [
      ...projects.map((p) => ({
        projectId: p.id,
        type: "project" as const,
        id: p.id,
        title: p.name,
        subtitle: p.address ?? "",
        link: `/projects/${p.id}`,
      })),
      ...clients.map((c) => ({
        type: "client" as const,
        id: c.id,
        title: c.name,
        subtitle: c.email ?? c.phone ?? "",
        link: `/clients/${c.id}`,
      })),
      ...invoices.map((i) => ({
        type: "invoice" as const,
        id: i.id,
        title: i.number,
        subtitle: i.client.name,
        link: `/invoices/${i.id}`,
      })),
      ...estimates.map((e) => ({
        projectId: e.project?.id,
        type: "estimate" as const,
        id: e.id,
        title: e.name,
        subtitle: e.project?.name ?? "",
        link: `/estimates/${e.id}`,
      })),
      ...documents.map((d) => ({
        type: "document" as const,
        id: d.id,
        title: d.name,
        subtitle: d.category,
        link: `/documents`,
      })),
      ...workers.map((w) => ({
        type: "worker" as const,
        id: w.id,
        title: w.name,
        subtitle: w.role ?? "",
        link: `/team/${w.id}`,
      })),
      ...suppliers.map((s) => ({
        type: "supplier" as const,
        id: s.id,
        title: s.name,
        subtitle: s.email ?? s.phone ?? "",
        link: `/suppliers`,
      })),
      ...rfis.map((r) => ({
        projectId: r.project.id,
        type: "rfi" as const,
        id: r.id,
        title: `${r.number}: ${r.subject}`,
        subtitle: r.project.name,
        link: `/projects/${r.project.id}`,
      })),
      ...punchListItems.map((p) => ({
        projectId: p.project.id,
        type: "punch_list_item" as const,
        id: p.id,
        title: p.title,
        subtitle: p.project.name,
        link: `/projects/${p.project.id}`,
      })),
      ...dedupedSubmittals.map((s) => ({
        projectId: s.project.id,
        type: "submittal" as const,
        id: s.id,
        title: `${s.number}: ${s.title}`,
        subtitle: s.project.name,
        link: `/projects/${s.project.id}`,
      })),
      ...incidents.map((inc) => ({
        projectId: inc.project.id,
        type: "incident_report" as const,
        id: inc.id,
        title: inc.description,
        subtitle: `${inc.project.name}${inc.location ? ` — ${inc.location}` : ""}`,
        link: `/projects/${inc.project.id}`,
      })),
      ...warrantyClaims.map((w) => ({
        projectId: w.project.id,
        type: "warranty_claim" as const,
        id: w.id,
        title: w.title,
        subtitle: w.project.name,
        link: `/projects/${w.project.id}`,
      })),
    ];

    const hidden = await this.hiddenProjectIds(companyId, userId, role);
    return results.filter((r) => !r.projectId || !hidden.has(r.projectId)).map(({ projectId: _projectId, ...r }) => r);
  }

  private async hiddenProjectIds(companyId: string, userId?: string, role?: string): Promise<Set<string>> {
    const restricted = await this.prisma.project.findMany({ where: { companyId, restrictedToMembers: true }, select: { id: true, restrictedToMembers: true } });
    if (restricted.length === 0) return new Set();
    const visible = new Set((await this.projectAccess.filterAccessible(restricted, userId, role)).map((p) => p.id));
    return new Set(restricted.filter((p) => !visible.has(p.id)).map((p) => p.id));
  }
}
