import type { MembershipRole } from "./roles";

/**
 * Who may open each built-in report (`GET /reports/<key>`). The API enforces this with @Roles; the
 * web app reads the same table to leave out what a role can't open, so the two can't drift apart.
 * The principle is what the job needs: company finances for those who run them, estimating figures
 * for estimators too, site operations for foremen, nothing financial for a worker.
 */
const FINANCE: readonly MembershipRole[] = ["owner", "admin", "accountant"];
const ESTIMATING: readonly MembershipRole[] = ["owner", "admin", "accountant", "estimator"];
const OPERATIONS: readonly MembershipRole[] = ["owner", "admin", "accountant", "foreman"];

export const REPORT_ROLES = {
  overview: FINANCE,
  "period-comparison": FINANCE,
  "project-margins": FINANCE,
  "invoice-aging": FINANCE,
  "cash-flow-forecast": FINANCE,
  "revenue-trend": FINANCE,
  "tax-summary": FINANCE,
  "wip-report": FINANCE,
  backlog: FINANCE,
  "estimate-at-completion": ESTIMATING,
  "win-rate": ESTIMATING,
  // Schedule health and money together: finance and estimating, not the site.
  portfolio: ESTIMATING,
  "compliance-calendar": OPERATIONS,
  "geofence-violations": OPERATIONS,
  "equipment-utilization": OPERATIONS,
  "warehouse-turnover": OPERATIONS,
} as const satisfies Record<string, readonly MembershipRole[]>;

export type ReportKey = keyof typeof REPORT_ROLES;

/** Whether a member may open `report` — by their own role or a custom role's added ones, the same
 * way the API's RolesGuard decides. */
export function canViewReport(report: ReportKey, role: string | undefined, additionalRoles: readonly string[] = []): boolean {
  const allowed: readonly string[] = REPORT_ROLES[report];
  return (role !== undefined && allowed.includes(role)) || additionalRoles.some((r) => allowed.includes(r));
}
