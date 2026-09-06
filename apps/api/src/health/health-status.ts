export interface CheckResult {
  ok: boolean;
  error?: string;
}

export interface HealthReport {
  status: "ok" | "error";
  checks: Record<string, CheckResult>;
}

/** Overall status is "ok" only when every individual check passed — a health check that reports
 * "ok" while one dependency is actually down would defeat the point of having it. */
export function computeHealthReport(checks: Record<string, CheckResult>): HealthReport {
  const status = Object.values(checks).every((c) => c.ok) ? "ok" : "error";
  return { status, checks };
}
