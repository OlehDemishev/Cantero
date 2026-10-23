import { z } from "zod";
import type { Permission } from "./permissions";
import { REPORT_PERMISSIONS } from "./report-access";

export const DASHBOARD_WIDGET_TYPES = [
  "revenue_trend",
  "cash_flow_forecast",
  "project_margins",
  "portfolio_summary",
  "invoice_aging",
  "warehouse_turnover",
  "labor_cost",
  "custom_report",
  "backlog",
  "compliance_calendar",
] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];

/**
 * The capability each widget type needs: the same one its interactive endpoint asks for (the
 * built-in reports via REPORT_PERMISSIONS, GET /team/labor-cost-report, GET /custom-reports/:id/run).
 * The API refuses to add a widget the member can't see and leaves it out of their dashboard if they
 * later lose the capability; the web app reads the same table to offer only what the member may add.
 */
export const DASHBOARD_WIDGET_PERMISSIONS = {
  revenue_trend: REPORT_PERMISSIONS["revenue-trend"],
  cash_flow_forecast: REPORT_PERMISSIONS["cash-flow-forecast"],
  project_margins: REPORT_PERMISSIONS["project-margins"],
  portfolio_summary: REPORT_PERMISSIONS.portfolio,
  invoice_aging: REPORT_PERMISSIONS["invoice-aging"],
  warehouse_turnover: REPORT_PERMISSIONS["warehouse-turnover"],
  labor_cost: "people.rates",
  custom_report: "reports.custom",
  backlog: REPORT_PERMISSIONS.backlog,
  compliance_calendar: REPORT_PERMISSIONS["compliance-calendar"],
} as const satisfies Record<DashboardWidgetType, Permission>;

/** Whether a member holding `permissions` may add and see a widget of `type`. */
export function canViewDashboardWidget(type: DashboardWidgetType, permissions: readonly string[] | undefined): boolean {
  return !!permissions?.includes(DASHBOARD_WIDGET_PERMISSIONS[type]);
}

/** The widget types a member holding `permissions` may add, in DASHBOARD_WIDGET_TYPES order. */
export function visibleDashboardWidgetTypes(permissions: readonly string[] | undefined): DashboardWidgetType[] {
  return DASHBOARD_WIDGET_TYPES.filter((type) => canViewDashboardWidget(type, permissions));
}

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
