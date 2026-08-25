import { z } from "zod";

export const DASHBOARD_WIDGET_TYPES = [
  "revenue_trend",
  "cash_flow_forecast",
  "project_margins",
  "portfolio_summary",
  "invoice_aging",
  "warehouse_turnover",
  "labor_cost",
  "custom_report",
] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];

export const createDashboardWidgetSchema = z.object({
  type: z.enum(DASHBOARD_WIDGET_TYPES),
  /// e.g. { "customReportId": "..." } for type=custom_report, { "months": 6 } for trend-style widgets.
  config: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDashboardWidgetInput = z.infer<typeof createDashboardWidgetSchema>;

export const reorderDashboardWidgetsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ReorderDashboardWidgetsInput = z.infer<typeof reorderDashboardWidgetsSchema>;
