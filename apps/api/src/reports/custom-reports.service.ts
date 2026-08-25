import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCustomReportInput, ReportDefinitionInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { toCsv } from "../common/csv";
import { DATASET_FIELDS, fetchDatasetRows, type ReportField } from "./report-datasets";

export interface ReportRunResult {
  columns: ReportField[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class CustomReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
  async preview(companyId: string, definition: ReportDefinitionInput): Promise<ReportRunResult> {
    return this.execute(companyId, definition);
  }

  async run(companyId: string, id: string): Promise<ReportRunResult> {
    const report = await this.prisma.customReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Report not found");
    return this.execute(companyId, {
      dataset: report.dataset,
      columns: report.columns,
      dateFrom: report.dateFrom?.toISOString(),
      dateTo: report.dateTo?.toISOString(),
      statusEquals: report.statusEquals ?? undefined,
    });
  }

  async exportCsv(companyId: string, id: string): Promise<string> {
    const { columns, rows } = await this.run(companyId, id);
    return toCsv(
      columns.map((c) => c.label),
      rows.map((row) => columns.map((c) => formatCell(row[c.key]))),
    );
  }

  private async execute(companyId: string, definition: ReportDefinitionInput): Promise<ReportRunResult> {
    const allFields = DATASET_FIELDS[definition.dataset];
    const columns = allFields.filter((f) => definition.columns.includes(f.key));

    const allRows = await fetchDatasetRows(this.prisma, companyId, definition.dataset, {
      dateFrom: definition.dateFrom ? new Date(definition.dateFrom) : undefined,
      dateTo: definition.dateTo ? new Date(definition.dateTo) : undefined,
      statusEquals: definition.statusEquals,
    });

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
