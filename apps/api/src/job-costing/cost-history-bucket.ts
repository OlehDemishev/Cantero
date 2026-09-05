export interface CostHistoryEntry {
  amount: number;
  incurredDate: Date;
  paid: boolean;
}
export interface CostHistoryMonthBucket {
  month: string;
  committed: number;
  actual: number;
  cumulativeActual: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Month-bucketed subcontractor-cost history for a burn-down chart — same data source as
 * JobCostingService.report()'s committed/actual columns (SubcontractorCost, unpaid vs. paid),
 * just spread over time instead of collapsed into one current snapshot. cumulativeActual is a
 * running total across the whole window, so the chart can show "spend so far" trending toward
 * the budget line rather than isolated monthly amounts.
 */
export function bucketCostHistoryByMonth(entries: CostHistoryEntry[], months: number, now: Date): CostHistoryMonthBucket[] {
  const buckets = new Map<string, { committed: number; actual: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, { committed: 0, actual: 0 });
  }
  for (const entry of entries) {
    const key = `${entry.incurredDate.getFullYear()}-${String(entry.incurredDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (entry.paid) bucket.actual += entry.amount;
    else bucket.committed += entry.amount;
  }

  let cumulativeActual = 0;
  return [...buckets.entries()].map(([month, { committed, actual }]) => {
    cumulativeActual += actual;
    return { month, committed: round2(committed), actual: round2(actual), cumulativeActual: round2(cumulativeActual) };
  });
}
