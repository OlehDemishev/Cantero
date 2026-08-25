import { z } from "zod";

export const REPORT_DATASETS = ["projects", "invoices", "estimates", "time_entries", "punch_list", "rfis"] as const;
export type ReportDataset = (typeof REPORT_DATASETS)[number];

export const reportDefinitionSchema = z.object({
  dataset: z.enum(REPORT_DATASETS),
  columns: z.array(z.string()).min(1),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  statusEquals: z.string().optional(),
});
export type ReportDefinitionInput = z.infer<typeof reportDefinitionSchema>;

export const createCustomReportSchema = reportDefinitionSchema.extend({
  name: z.string().min(1).max(120),
});
export type CreateCustomReportInput = z.infer<typeof createCustomReportSchema>;
