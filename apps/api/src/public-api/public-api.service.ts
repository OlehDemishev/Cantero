import { Injectable } from "@nestjs/common";
import { toCsv } from "../common/csv";
import { ProjectsService } from "../projects/projects.service";
import { ClientsService } from "../crm/clients.service";
import { InvoicesService } from "../finance/invoices.service";
import { EstimatesService } from "../estimates/estimates.service";
import { WorkersService } from "../team/workers.service";
import { MaterialCatalogService } from "../materials/material-catalog.service";

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
}
