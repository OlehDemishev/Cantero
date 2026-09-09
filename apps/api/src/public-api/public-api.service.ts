import { Injectable } from "@nestjs/common";
import archiver from "archiver";
import type { ApiKeyScope } from "@cantero/shared";
import { toCsv } from "../common/csv";
import type { AuditActor } from "../common/audit/audit.service";
import { ProjectsService } from "../projects/projects.service";
import { ClientsService } from "../crm/clients.service";
import { InvoicesService } from "../finance/invoices.service";
import { EstimatesService } from "../estimates/estimates.service";
import { WorkersService } from "../team/workers.service";
import { MaterialCatalogService } from "../materials/material-catalog.service";
import { TimeEntriesService } from "../team/time-entries.service";
import { BudgetService } from "../finance/budget.service";
import { paginate, type PageParams } from "./pagination";

export type ExportFormat = "json" | "csv";

/** Every write made through the public API is attributed to this synthetic actor in audit logs —
 * there's no human user behind an API-key request, unlike every other write path in this app. */
const API_KEY_ACTOR: AuditActor = { userId: "api-key", name: "Public API" };

@Injectable()
export class PublicApiService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly clientsService: ClientsService,
    private readonly invoicesService: InvoicesService,
    private readonly estimatesService: EstimatesService,
    private readonly workersService: WorkersService,
    private readonly materialCatalogService: MaterialCatalogService,
    private readonly timeEntriesService: TimeEntriesService,
    private readonly budgetService: BudgetService,
  ) {}

  async projects(companyId: string, format: ExportFormat, page?: PageParams) {
    const rows = paginate(await this.projectsService.list(companyId), page);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Address", "Client", "Created"],
      rows.map((p) => [p.id, p.name, p.address ?? "", p.client?.name ?? "", p.createdAt.toISOString().slice(0, 10)]),
    );
  }

  async clients(companyId: string, format: ExportFormat, page?: PageParams) {
    const rows = paginate(await this.clientsService.list(companyId), page);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Email", "Phone", "Stage", "Created"],
      rows.map((c) => [c.id, c.name, c.email ?? "", c.phone ?? "", c.stage, c.createdAt.toISOString().slice(0, 10)]),
    );
  }

  /** CSV format delegates to InvoicesService's own richer accounting export (paid/outstanding
   * columns derived from payments) rather than rebuilding it here — pagination therefore only
   * applies to the JSON path, since that export does its own full-company query internally. */
  async invoices(companyId: string, format: ExportFormat, page?: PageParams) {
    if (format === "csv") return this.invoicesService.exportCsv(companyId);
    return paginate(await this.invoicesService.list(companyId), page);
  }

  async estimates(companyId: string, format: ExportFormat, page?: PageParams) {
    const rows = paginate(await this.estimatesService.list(companyId), page);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Status", "Project", "Grand total"],
      rows.map((e) => [e.id, e.name, e.status, e.project?.name ?? "", e.grandTotal.toString()]),
    );
  }

  async workers(companyId: string, format: ExportFormat, page?: PageParams) {
    const rows = paginate(await this.workersService.list(companyId), page);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Role", "Hourly cost", "Active"],
      rows.map((w) => [w.id, w.name, w.role ?? "", w.hourlyCost?.toString() ?? "", w.active ? "yes" : "no"]),
    );
  }

  async materials(companyId: string, format: ExportFormat, page?: PageParams) {
    const rows = paginate(await this.materialCatalogService.list(companyId), page);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Code", "Name", "Unit", "Default unit price"],
      rows.map((m) => [m.id, m.code, m.name, m.unit, m.defaultUnitPrice.toString()]),
    );
  }

  async timeEntries(companyId: string, format: ExportFormat, page?: PageParams) {
    // Pushed into the query itself (take/skip) rather than fetched in full and sliced via
    // paginate() — that in-memory slice still required reading every time entry the company ever
    // logged on every paginated request. limit/offset stay the external contract; internally
    // they map onto TimeEntriesService's cursor-pagination signature as a plain offset.
    const rows = await this.timeEntriesService.list(
      companyId,
      {},
      page ? { take: page.limit, skip: page.offset } : undefined,
    );
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Worker", "Project", "Date", "Hours"],
      rows.map((t) => [t.id, t.worker.name, t.project.name, t.date.toISOString().slice(0, 10), t.hours.toString()]),
    );
  }

  /** One row per project: budgeted vs. actual cost — the dataset a BI tool would pull to build
   * a job-cost dashboard without re-deriving the math itself. Pagination applies to the project
   * list before the (expensive, per-project) budget lookup runs, not after. */
  async budget(companyId: string, format: ExportFormat, page?: PageParams) {
    const projects = paginate(await this.projectsService.list(companyId), page);
    const rows = await Promise.all(
      projects.map(async (p) => ({ project: p, budget: await this.budgetService.getForProject(companyId, p.id) })),
    );
    if (format === "json") return rows;
    return toCsv(
      ["Project ID", "Project", "Budget total", "Materials actual", "Labor actual", "Invoiced total"],
      rows.map((r) => [
        r.project.id,
        r.project.name,
        r.budget.grandTotalBudget.toString(),
        r.budget.materialsCostActual.toString(),
        r.budget.laborCostActual.toString(),
        r.budget.invoicedTotal.toString(),
      ]),
    );
  }

  /**
   * A ZIP with one CSV per resource the calling key has scope for (every resource, when the key
   * is unrestricted) — the "give me everything" counterpart to hitting all 8 routes by hand.
   * Reuses each resource's own CSV builder above, so this can never drift from what the
   * individual /v1/<resource> routes already produce.
   */
  async exportAll(companyId: string, scopes: ApiKeyScope[]): Promise<Buffer> {
    const allowed = (scope: ApiKeyScope) => scopes.length === 0 || scopes.includes(scope);
    const files: [string, Promise<string>][] = [];
    if (allowed("projects")) files.push(["projects.csv", this.projects(companyId, "csv") as Promise<string>]);
    if (allowed("clients")) files.push(["clients.csv", this.clients(companyId, "csv") as Promise<string>]);
    if (allowed("invoices")) files.push(["invoices.csv", this.invoices(companyId, "csv") as Promise<string>]);
    if (allowed("estimates")) files.push(["estimates.csv", this.estimates(companyId, "csv") as Promise<string>]);
    if (allowed("workers")) files.push(["workers.csv", this.workers(companyId, "csv") as Promise<string>]);
    if (allowed("materials")) files.push(["materials.csv", this.materials(companyId, "csv") as Promise<string>]);
    if (allowed("time-entries")) files.push(["time-entries.csv", this.timeEntries(companyId, "csv") as Promise<string>]);
    if (allowed("budget")) files.push(["budget.csv", this.budget(companyId, "csv") as Promise<string>]);

    const resolved = await Promise.all(files.map(async ([name, contentPromise]) => [name, await contentPromise] as const));

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });
    for (const [name, content] of resolved) archive.append(content, { name });
    archive.finalize();
    return done;
  }

  /** Bulk-create materials from a CSV body — a key scoped for "materials" can both read and
   * write that resource, matching how the scope has always meant "access to this resource,"
   * not a separate read/write distinction. Delegates entirely to the same importer the internal
   * CSV-upload UI uses, so validation/dedupe rules can never drift between the two entry points. */
  importMaterials(companyId: string, csv: string) {
    return this.materialCatalogService.importCsv(companyId, API_KEY_ACTOR, csv);
  }

  importClients(companyId: string, csv: string) {
    return this.clientsService.importCsv(companyId, API_KEY_ACTOR, csv);
  }
}
