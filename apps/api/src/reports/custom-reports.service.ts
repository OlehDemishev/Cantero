import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCustomReportInput, ReportDataset, ReportDefinitionInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { toCsv } from "../common/csv";
import { LaborCostService } from "../team/labor-cost.service";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";
import { fetchDatasetRows, fieldsFor, type ReportField } from "./report-datasets";
import { ReportsService } from "./reports.service";

export interface ReportRunResult {
  columns: ReportField[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class CustomReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly laborCost: LaborCostService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  fieldsFor(companyId: string, dataset: ReportDataset) {
    return fieldsFor(this.prisma, companyId, dataset);
  }

  list(companyId: string) {
    return this.prisma.customReport.findMany({
      where: { companyId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  create(companyId: string, userId: string, input: CreateCustomReportInput) {
    return this.prisma.customReport.create({
      data: {
        companyId,
        userId,
        name: input.name,
        dataset: input.dataset,
        columns: input.columns,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        statusEquals: input.statusEquals,
      },
    });
  }

  async delete(companyId: string, id: string) {
    const report = await this.prisma.customReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Report not found");
    await this.prisma.customReport.delete({ where: { id } });
    return { ok: true };
  }

  /** Ad-hoc preview: runs a definition without persisting it, for the builder UI's live results. */
  async preview(companyId: string, definition: ReportDefinitionInput, viewer: ProjectViewer): Promise<ReportRunResult> {
    return this.execute(companyId, definition, viewer);
  }

  /** Runs a saved report for whoever is looking at it: `viewer` (not the report's author) decides
   * which restricted projects' rows are in it, so sharing a report never shares access. */
  async run(companyId: string, id: string, viewer: ProjectViewer): Promise<ReportRunResult> {
    const report = await this.prisma.customReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Report not found");
    return this.execute(companyId, {
      dataset: report.dataset,
      columns: report.columns,
      dateFrom: report.dateFrom?.toISOString(),
      dateTo: report.dateTo?.toISOString(),
      statusEquals: report.statusEquals ?? undefined,
    }, viewer);
  }

  async exportCsv(companyId: string, id: string, viewer: ProjectViewer): Promise<string> {
    const { columns, rows } = await this.run(companyId, id, viewer);
    return toCsv(
      columns.map((c) => c.label),
      rows.map((row) => columns.map((c) => formatCell(row[c.key]))),
    );
  }

  private async execute(companyId: string, definition: ReportDefinitionInput, viewer: ProjectViewer): Promise<ReportRunResult> {
    const allFields = await fieldsFor(this.prisma, companyId, definition.dataset);
    const columns = allFields.filter((f) => definition.columns.includes(f.key));

    const allRows = await fetchDatasetRows(
      { prisma: this.prisma, reports: this.reports, laborCost: this.laborCost, projectAccess: this.projectAccess },
      companyId,
      definition.dataset,
      {
        dateFrom: definition.dateFrom ? new Date(definition.dateFrom) : undefined,
        dateTo: definition.dateTo ? new Date(definition.dateTo) : undefined,
        statusEquals: definition.statusEquals,
      },
      viewer,
    );

    const rows = allRows.map((row) => {
      const picked: Record<string, unknown> = {};
      for (const col of columns) picked[col.key] = row[col.key];
      return picked;
    });

    return { columns, rows };
  }
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
