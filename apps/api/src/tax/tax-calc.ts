const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxRateWindow {
  ratePercent: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** Picks the rate whose [effectiveFrom, effectiveTo) window contains `asOf` — a null effectiveTo
 * means still current. Returns null when no rate covers that date, rather than falling back to
 * some other rate that doesn't actually apply. */
export function findActiveRate(rates: TaxRateWindow[], asOf: Date): TaxRateWindow | null {
  return rates.find((r) => r.effectiveFrom <= asOf && (r.effectiveTo === null || r.effectiveTo > asOf)) ?? null;
}

export interface CalculateTaxInput {
  subtotal: number;
  rate: TaxRateWindow | null;
  isExempt: boolean;
}

export interface CalculateTaxResult {
  taxAmount: number;
  ratePercentApplied: number;
}

/** An exempt client (valid certificate on file) always owes zero tax regardless of rate; a
 * jurisdiction with no active rate for the invoice's date also computes to zero, since there's
 * nothing to apply — not an error, just no tax basis known for that date. */
export function calculateTax({ subtotal, rate, isExempt }: CalculateTaxInput): CalculateTaxResult {
  if (isExempt || !rate) return { taxAmount: 0, ratePercentApplied: 0 };
  return { taxAmount: round2(subtotal * (rate.ratePercent / 100)), ratePercentApplied: rate.ratePercent };
}
