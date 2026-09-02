const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const MIN_SAMPLE = 3;
const Z_THRESHOLD = 2;

export interface ExpenseAnomalyResult {
  isAnomaly: boolean;
  historicalAverage: number | null;
  historicalSampleSize: number;
  deviationPercent: number | null;
}

/**
 * Flags an expense whose amount is a statistical outlier against the company's own history of
 * approved/pending expenses in the same category — same median/mean-deviation heuristic style as
 * CostBenchmarkService, applied to Expense instead of EstimateLine. No external data or LLM.
 * Needs at least MIN_SAMPLE prior expenses in the category to say anything; below that, every
 * expense is "not enough history" rather than a false anomaly.
 */
export function detectExpenseAnomaly(amount: number, historicalAmounts: number[]): ExpenseAnomalyResult {
  if (historicalAmounts.length < MIN_SAMPLE) {
    return { isAnomaly: false, historicalAverage: null, historicalSampleSize: historicalAmounts.length, deviationPercent: null };
  }

  const mean = historicalAmounts.reduce((sum, a) => sum + a, 0) / historicalAmounts.length;
  const variance = historicalAmounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / historicalAmounts.length;
  const stddev = Math.sqrt(variance);
  const threshold = stddev > 0 ? mean + Z_THRESHOLD * stddev : mean * 2;

  return {
    isAnomaly: amount > threshold && amount > mean * 1.2,
    historicalAverage: round2(mean),
    historicalSampleSize: historicalAmounts.length,
    deviationPercent: mean > 0 ? Math.round(((amount - mean) / mean) * 1000) / 10 : null,
  };
}
