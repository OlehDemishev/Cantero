import { z } from "zod";
import type { ReportKey } from "./report-access";

export const SCHEDULED_REPORT_TYPES = [
  "overview",
  "project_margins",
  "warehouse_turnover",
  "invoice_aging",
  "portfolio",
  "cash_flow_forecast",
] as const;
export type ScheduledReportType = (typeof SCHEDULED_REPORT_TYPES)[number];

/** The interactive report (GET /reports/<key>) each scheduled type mirrors. Its permission
 * (REPORT_PERMISSIONS) is what a member needs to schedule it, and what the report's author still
 * needs every time it's sent. */
export const SCHEDULED_REPORT_KEYS: Record<ScheduledReportType, ReportKey> = {
  overview: "overview",
  project_margins: "project-margins",
  warehouse_turnover: "warehouse-turnover",
  invoice_aging: "invoice-aging",
  portfolio: "portfolio",
  cash_flow_forecast: "cash-flow-forecast",
};

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
