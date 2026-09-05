export interface CostCodeRow {
  costCodeId: string | null;
  code: string;
  name: string;
  estimated: number;
  committed: number;
  actual: number;
}

export interface CostCodeOverrun {
  costCodeId: string | null;
  code: string;
  name: string;
  estimated: number;
  spent: number;
  /** 0-100+, spent as a percentage of estimated. */
  ratioPercent: number;
  severity: "warning" | "critical";
}

/**
 * Flags individual cost codes trending over budget — catching one blown code (e.g. concrete)
 * before it's diluted by other codes staying on plan, which a whole-project budget check
 * (NotificationsService.budgetOverruns()) can't see. Rows with no estimated amount are skipped:
 * there's no budget to measure against, so any spend there isn't a "variance" in this sense.
 */
export function calculateCostCodeOverruns(rows: CostCodeRow[], thresholdPercent: number): CostCodeOverrun[] {
  return rows
    .filter((r) => r.estimated > 0)
    .map((r) => {
      const spent = r.committed + r.actual;
      const ratioPercent = (spent / r.estimated) * 100;
      const severity: "warning" | "critical" = ratioPercent >= 100 ? "critical" : "warning";
      return { costCodeId: r.costCodeId, code: r.code, name: r.name, estimated: r.estimated, spent, ratioPercent, severity };
    })
    .filter((r) => r.ratioPercent >= thresholdPercent);
}
