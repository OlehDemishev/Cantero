import { z } from "zod";

export const SCHEDULED_REPORT_TYPES = [
  "overview",
  "project_margins",
  "warehouse_turnover",
  "invoice_aging",
  "portfolio",
  "cash_flow_forecast",
] as const;
export type ScheduledReportType = (typeof SCHEDULED_REPORT_TYPES)[number];

export const SCHEDULED_REPORT_FREQUENCIES = ["weekly", "monthly"] as const;
export type ScheduledReportFrequency = (typeof SCHEDULED_REPORT_FREQUENCIES)[number];

export const createScheduledReportSchema = z.object({
  name: z.string().min(1).max(160),
  reportType: z.enum(SCHEDULED_REPORT_TYPES),
  frequency: z.enum(SCHEDULED_REPORT_FREQUENCIES),
  recipientEmails: z.array(z.string().email()).min(1).max(20),
});
export type CreateScheduledReportInput = z.infer<typeof createScheduledReportSchema>;

export const updateScheduledReportSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  frequency: z.enum(SCHEDULED_REPORT_FREQUENCIES).optional(),
  recipientEmails: z.array(z.string().email()).min(1).max(20).optional(),
  active: z.boolean().optional(),
});
export type UpdateScheduledReportInput = z.infer<typeof updateScheduledReportSchema>;
