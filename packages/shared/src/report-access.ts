import type { Permission } from "./permissions";

/**
 * The capability each built-in report (`GET /reports/<key>`) needs. The API enforces it with
 * @Requires; the web app reads the same table to leave out what the member can't open. Which roles
 * hold a capability is DEFAULT_GRANTS plus the company's own settings.
 */
export const REPORT_PERMISSIONS = {
  overview: "finance.view",
  "period-comparison": "finance.view",
  "project-margins": "finance.view",
  "invoice-aging": "finance.view",
  "cash-flow-forecast": "finance.view",
  "revenue-trend": "finance.view",
  "tax-summary": "finance.view",
  "wip-report": "finance.view",
  backlog: "finance.view",
  "estimate-at-completion": "costing.view",
  "win-rate": "costing.view",
  // Schedule health and money together: finance and estimating, not the site.
  portfolio: "costing.view",
  "compliance-calendar": "reports.operations",
  "geofence-violations": "reports.operations",
  "equipment-utilization": "reports.operations",
  "warehouse-turnover": "reports.operations",
} as const satisfies Record<string, Permission>;

export type ReportKey = keyof typeof REPORT_PERMISSIONS;

/** Whether a member holding `permissions` may open `report`. */
export function canViewReport(report: ReportKey, permissions: readonly string[] | undefined): boolean {
  return !!permissions?.includes(REPORT_PERMISSIONS[report]);
}
