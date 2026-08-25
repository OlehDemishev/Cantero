import type { ReportDataset } from "@cantero/shared";
import type { PrismaService } from "../common/prisma/prisma.service";

export interface ReportField {
  key: string;
  label: string;
}

export interface DatasetFilter {
  dateFrom?: Date;
  dateTo?: Date;
  statusEquals?: string;
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
};

/** Datasets with no status field — statusEquals is silently ignored for these. */
const NO_STATUS_DATASETS = new Set<ReportDataset>(["projects", "time_entries"]);

export async function fetchDatasetRows(
  prisma: PrismaService,
  companyId: string,
  dataset: ReportDataset,
  filter: DatasetFilter,
): Promise<Record<string, unknown>[]> {
  const statusEquals = NO_STATUS_DATASETS.has(dataset) ? undefined : filter.statusEquals;

  switch (dataset) {
    case "projects": {
      const rows = await prisma.project.findMany({
        where: { companyId, createdAt: dateRange(filter) },
        include: { client: { select: { name: true } } },
      });
      return rows.map((r) => ({
        name: r.name,
        address: r.address,
        client: r.client?.name ?? null,
        handoverDate: r.handoverDate,
        warrantyMonths: r.warrantyMonths,
        createdAt: r.createdAt,
      }));
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
  }
}

function dateRange(filter: DatasetFilter): { gte?: Date; lte?: Date } | undefined {
  if (!filter.dateFrom && !filter.dateTo) return undefined;
  return { gte: filter.dateFrom, lte: filter.dateTo };
}
