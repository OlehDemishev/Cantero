import { Injectable } from "@nestjs/common";
import { toCsv } from "../common/csv";
import { ProjectsService } from "../projects/projects.service";
import { ClientsService } from "../crm/clients.service";
import { InvoicesService } from "../finance/invoices.service";
import { EstimatesService } from "../estimates/estimates.service";
import { WorkersService } from "../team/workers.service";
import { MaterialCatalogService } from "../materials/material-catalog.service";
import { TimeEntriesService } from "../team/time-entries.service";
import { BudgetService } from "../finance/budget.service";

export type ExportFormat = "json" | "csv";

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

  async projects(companyId: string, format: ExportFormat) {
    const rows = await this.projectsService.list(companyId);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Address", "Client", "Created"],
      rows.map((p) => [p.id, p.name, p.address ?? "", p.client?.name ?? "", p.createdAt.toISOString().slice(0, 10)]),
    );
  }

  async clients(companyId: string, format: ExportFormat) {
    const rows = await this.clientsService.list(companyId);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Email", "Phone", "Stage", "Created"],
      rows.map((c) => [c.id, c.name, c.email ?? "", c.phone ?? "", c.stage, c.createdAt.toISOString().slice(0, 10)]),
    );
  }

  async invoices(companyId: string, format: ExportFormat) {
    if (format === "csv") return this.invoicesService.exportCsv(companyId);
    return this.invoicesService.list(companyId);
  }

  async estimates(companyId: string, format: ExportFormat) {
    const rows = await this.estimatesService.list(companyId);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Status", "Project", "Grand total"],
      rows.map((e) => [e.id, e.name, e.status, e.project?.name ?? "", e.grandTotal.toString()]),
    );
  }

  async workers(companyId: string, format: ExportFormat) {
    const rows = await this.workersService.list(companyId);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Name", "Role", "Hourly cost", "Active"],
      rows.map((w) => [w.id, w.name, w.role ?? "", w.hourlyCost?.toString() ?? "", w.active ? "yes" : "no"]),
    );
  }

  async materials(companyId: string, format: ExportFormat) {
    const rows = await this.materialCatalogService.list(companyId);
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Code", "Name", "Unit", "Default unit price"],
      rows.map((m) => [m.id, m.code, m.name, m.unit, m.defaultUnitPrice.toString()]),
    );
  }

  async timeEntries(companyId: string, format: ExportFormat) {
    const rows = await this.timeEntriesService.list(companyId, {});
    if (format === "json") return rows;
    return toCsv(
      ["ID", "Worker", "Project", "Date", "Hours"],
      rows.map((t) => [t.id, t.worker.name, t.project.name, t.date.toISOString().slice(0, 10), t.hours.toString()]),
    );
  }

  /** One row per project: budgeted vs. actual cost — the dataset a BI tool would pull to build
   * a job-cost dashboard without re-deriving the math itself. */
  async budget(companyId: string, format: ExportFormat) {
    const projects = await this.projectsService.list(companyId);
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
}
