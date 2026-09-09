const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const MIN_SAMPLE = 3;
const Z_THRESHOLD = 2;

export interface ExpenseAnomalyResult {
  isAnomaly: boolean;
  historicalAverage: number | null;
  historicalSampleSize: number;
  deviationPercent: number | null;
}

interface AnomalyStats {
  n: number;
  mean: number;
  variance: number;
}

/** Shared threshold/formatting logic for both entry points below — takes already-computed
 * mean/variance rather than a raw sample array, so the O(1) aggregate-based path (ExpensesService)
 * and the O(n) array-based path (this file's own callers/tests) produce identical results from
 * the same underlying statistics. */
function anomalyFromStats(amount: number, stats: AnomalyStats): ExpenseAnomalyResult {
  if (stats.n < MIN_SAMPLE) {
    return { isAnomaly: false, historicalAverage: null, historicalSampleSize: stats.n, deviationPercent: null };
  }

  const stddev = Math.sqrt(stats.variance);
  const threshold = stddev > 0 ? stats.mean + Z_THRESHOLD * stddev : stats.mean * 2;

  return {
    isAnomaly: amount > threshold && amount > stats.mean * 1.2,
    historicalAverage: round2(stats.mean),
    historicalSampleSize: stats.n,
    deviationPercent: stats.mean > 0 ? Math.round(((amount - stats.mean) / stats.mean) * 1000) / 10 : null,
  };
}

/**
 * Flags an expense whose amount is a statistical outlier against the company's own history of
 * approved/pending expenses in the same category — same median/mean-deviation heuristic style as
 * CostBenchmarkService, applied to Expense instead of EstimateLine. No external data or LLM.
 * Needs at least MIN_SAMPLE prior expenses in the category to say anything; below that, every
 * expense is "not enough history" rather than a false anomaly.
 */
export function detectExpenseAnomaly(amount: number, historicalAmounts: number[]): ExpenseAnomalyResult {
  const n = historicalAmounts.length;
  if (n < MIN_SAMPLE) return anomalyFromStats(amount, { n, mean: 0, variance: 0 });

  const mean = historicalAmounts.reduce((sum, a) => sum + a, 0) / n;
  const variance = historicalAmounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / n;
  return anomalyFromStats(amount, { n, mean, variance });
}

/** Same detection as detectExpenseAnomaly, but from pre-aggregated (count, sum, sum-of-squares)
 * statistics instead of a materialized array of every historical amount — lets a caller compute
 * one grouped SQL aggregate per category up front instead of an O(n) array per expense row. See
 * ExpensesService.list(), which computes count/sum/sumSq once per category via $queryRaw. */
export function detectExpenseAnomalyFromAggregate(amount: number, agg: { n: number; sum: number; sumSq: number }): ExpenseAnomalyResult {
  if (agg.n < MIN_SAMPLE) return anomalyFromStats(amount, { n: agg.n, mean: 0, variance: 0 });

  const mean = agg.sum / agg.n;
  // Clamp to 0: floating-point sumSq/n - mean² can go slightly negative for near-zero variance.
  const variance = Math.max(agg.sumSq / agg.n - mean * mean, 0);
  return anomalyFromStats(amount, { n: agg.n, mean, variance });
}
