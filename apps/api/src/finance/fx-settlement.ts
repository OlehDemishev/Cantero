export interface FxSettlementInput {
  foreignAmount: number;
  /** The rate actually used to settle — e.g. the bank's wire rate, foreign currency -> invoice currency. */
  actualRate: number;
  /** The company's current benchmark rate for the same pair — null when no benchmark rate is on file. */
  benchmarkRate: number | null;
}
export interface FxSettlementResult {
  /** foreignAmount * actualRate, in the invoice's currency — this is what gets credited to the invoice. */
  convertedAmount: number;
  /** foreignAmount * benchmarkRate — null when there's no benchmark to compare against. */
  benchmarkAmount: number | null;
  /** convertedAmount - benchmarkAmount: positive means the settlement beat the benchmark rate. Null with no benchmark. */
  gainLoss: number | null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compares a foreign-currency payment's actual settlement rate against the company's current
 * benchmark exchange rate for the same currency pair — the "did we get a better or worse deal
 * than the going rate" figure companies check when a client wires in a currency other than the
 * invoice's own. This is not a historical invoice-date-vs-payment-date comparison (the schema
 * only tracks one current rate per pair, not a time series), so it's a same-moment benchmark
 * check, not a true booked-vs-realized accounting gain/loss.
 */
export function calculateFxSettlement({ foreignAmount, actualRate, benchmarkRate }: FxSettlementInput): FxSettlementResult {
  const convertedAmount = round2(foreignAmount * actualRate);
  if (benchmarkRate === null) return { convertedAmount, benchmarkAmount: null, gainLoss: null };

  const benchmarkAmount = round2(foreignAmount * benchmarkRate);
  return { convertedAmount, benchmarkAmount, gainLoss: round2(convertedAmount - benchmarkAmount) };
}
