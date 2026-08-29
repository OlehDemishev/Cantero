import type { ReportDataset } from "@cantero/shared";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ReportsService } from "./reports.service";
import type { LaborCostService } from "../team/labor-cost.service";

export interface ReportField {
  key: string;
  label: string;
}

export interface DatasetFilter {
  dateFrom?: Date;
  dateTo?: Date;
  statusEquals?: string;
}

export interface DatasetDeps {
  prisma: PrismaService;
  reports: ReportsService;
  laborCost: LaborCostService;
}

/** Each dataset has exactly one built-in date field it filters on — keeps the builder's date-range filter simple instead of letting the user pick which field. */
export const DATASET_FIELDS: Record<ReportDataset, ReportField[]> = {
  projects: [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "client", label: "Client" },
    { key: "handoverDate", label: "Handover date" },
    { key: "warrantyMonths", label: "Warranty (months)" },
    { key: "createdAt", label: "Created" },
  ],
  invoices: [
    { key: "number", label: "Number" },
    { key: "status", label: "Status" },
    { key: "client", label: "Client" },
    { key: "project", label: "Project" },
    { key: "subtotal", label: "Subtotal" },
    { key: "taxAmount", label: "Tax" },
    { key: "total", label: "Total" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
  estimates: [
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "grandTotal", label: "Grand total" },
    { key: "createdAt", label: "Created" },
  ],
  time_entries: [
    { key: "worker", label: "Worker" },
    { key: "project", label: "Project" },
    { key: "task", label: "Task" },
    { key: "hours", label: "Hours" },
    { key: "date", label: "Date" },
  ],
  punch_list: [
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
  rfis: [
    { key: "number", label: "Number" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "project", label: "Project" },
    { key: "dueDate", label: "Due date" },
    { key: "createdAt", label: "Created" },
  ],
  revenue_by_month: [
    { key: "month", label: "Month" },
    { key: "revenue", label: "Revenue" },
  ],
  project_margins: [
    { key: "projectName", label: "Project" },
    { key: "invoicedTotal", label: "Invoiced" },
    { key: "actualCost", label: "Actual cost" },
    { key: "margin", label: "Margin" },
    { key: "marginPercent", label: "Margin %" },
  ],
  labor_utilization: [
    { key: "workerName", label: "Worker" },
    { key: "role", label: "Role" },
    { key: "hours", label: "Hours" },
    { key: "cost", label: "Cost" },
  ],
};

/** Datasets with no status field — statusEquals is silently ignored for these. */
const NO_STATUS_DATASETS = new Set<ReportDataset>(["projects", "time_entries"]);

/** Field list for a dataset, extended with this company's custom-field definitions for datasets
 * that support them (currently just "projects" — CustomFieldDefinition only covers project/client
 * entities, and there's no "clients" dataset yet). Async because it's a DB lookup, unlike the
 * static DATASET_FIELDS map. */
export async function fieldsFor(prisma: PrismaService, companyId: string, dataset: ReportDataset): Promise<ReportField[]> {
  const base = DATASET_FIELDS[dataset];
  if (dataset !== "projects") return base;

  const customFields = await prisma.customFieldDefinition.findMany({
    where: { companyId, entityType: "project" },
    orderBy: { sortOrder: "asc" },
  });
  return [...base, ...customFields.map((f) => ({ key: `custom_${f.id}`, label: f.name }))];
}

export async function fetchDatasetRows(
  deps: DatasetDeps,
  companyId: string,
  dataset: ReportDataset,
  filter: DatasetFilter,
): Promise<Record<string, unknown>[]> {
  const { prisma } = deps;
  const statusEquals = NO_STATUS_DATASETS.has(dataset) ? undefined : filter.statusEquals;

  switch (dataset) {
    case "projects": {
      const rows = await prisma.project.findMany({
        where: { companyId, createdAt: dateRange(filter) },
        include: { client: { select: { name: true } } },
      });
      const customFields = await prisma.customFieldDefinition.findMany({ where: { companyId, entityType: "project" } });
      const customValues = customFields.length
        ? await prisma.customFieldValue.findMany({
            where: { fieldId: { in: customFields.map((f) => f.id) }, entityId: { in: rows.map((r) => r.id) } },
          })
        : [];
      const valuesByEntity = new Map<string, Map<string, string | null>>();
      for (const v of customValues) {
        if (!valuesByEntity.has(v.entityId)) valuesByEntity.set(v.entityId, new Map());
        valuesByEntity.get(v.entityId)!.set(v.fieldId, v.value);
      }

      return rows.map((r) => {
        const base: Record<string, unknown> = {
          name: r.name,
          address: r.address,
          client: r.client?.name ?? null,
          handoverDate: r.handoverDate,
          warrantyMonths: r.warrantyMonths,
          createdAt: r.createdAt,
        };
        for (const f of customFields) {
          base[`custom_${f.id}`] = valuesByEntity.get(r.id)?.get(f.id) ?? null;
        }
        return base;
      });
    }
    case "invoices": {
      const rows = await prisma.invoice.findMany({
        where: { companyId, createdAt: dateRange(filter), status: statusEquals ? (statusEquals as never) : undefined },
        include: { client: { select: { name: true } }, project: { select: { name: true } } },
      });
      return rows.map((r) => ({
        number: r.number,
        status: r.status,
        client: r.client.name,
        project: r.project.name,
        subtotal: r.subtotal,
        taxAmount: r.taxAmount,
        total: r.total,
        dueDate: r.dueDate,
        createdAt: r.createdAt,
      }));
    }
    case "estimates": {
      const rows = await prisma.estimate.findMany({
        where: { companyId, createdAt: dateRange(filter), status: statusEquals ? (statusEquals as never) : undefined },
        include: { project: { select: { name: true } } },
      });
      return rows.map((r) => ({
        name: r.name,
        status: r.status,
        project: r.project?.name ?? null,
        grandTotal: r.grandTotal,
        createdAt: r.createdAt,
      }));
    }
    case "time_entries": {
      const rows = await prisma.timeEntry.findMany({
        where: { companyId, date: dateRange(filter) },
        include: { worker: { select: { name: true } }, project: { select: { name: true } }, task: { select: { name: true } } },
      });
      return rows.map((r) => ({
        worker: r.worker.name,
        project: r.project.name,
        task: r.task?.name ?? null,
        hours: r.hours,
        date: r.date,
      }));
    }
    case "punch_list": {
      const rows = await prisma.punchListItem.findMany({
        where: { companyId, createdAt: dateRange(filter), status: statusEquals ? (statusEquals as never) : undefined },
        include: { project: { select: { name: true } } },
      });
      return rows.map((r) => ({
        title: r.title,
        status: r.status,
        project: r.project.name,
        dueDate: r.dueDate,
        createdAt: r.createdAt,
      }));
    }
    case "rfis": {
      const rows = await prisma.rfi.findMany({
        where: { companyId, createdAt: dateRange(filter), status: statusEquals ? (statusEquals as never) : undefined },
        include: { project: { select: { name: true } } },
      });
      return rows.map((r) => ({
        number: r.number,
        subject: r.subject,
        status: r.status,
        project: r.project.name,
        dueDate: r.dueDate,
        createdAt: r.createdAt,
      }));
    }
    case "revenue_by_month": {
      return deps.reports.revenueTrend(companyId);
    }
    case "project_margins": {
      return deps.reports.projectMargins(companyId);
    }
    case "labor_utilization": {
      const report = await deps.laborCost.report(companyId, {});
      return report.byWorker;
    }
  }
}

function dateRange(filter: DatasetFilter): { gte?: Date; lte?: Date } | undefined {
  if (!filter.dateFrom && !filter.dateTo) return undefined;
  return { gte: filter.dateFrom, lte: filter.dateTo };
}
