import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

export type SearchResultType = "project" | "client" | "invoice" | "estimate" | "document" | "worker" | "supplier";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(companyId: string, query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return [];

    const contains = { contains: q, mode: "insensitive" as const };

    const [projects, clients, invoices, estimates, documents, workers, suppliers] = await Promise.all([
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
    ]);

    const results: SearchResult[] = [
      ...projects.map((p) => ({
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
    ];

    return results;
  }
}
