export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Below this magnitude, a price edit is treated as a rounding/rate-negotiation tweak, not a
 * market swing worth a notification — keeps the price-change log from filling up with noise. */
export const SIGNIFICANT_PRICE_CHANGE_THRESHOLD_PERCENT = 10;

/** A price moving away from exactly 0 is always reported as a full 100% increase (there's no
 * finite percentage that describes "from free to not-free"), rather than dividing by zero. */
export function calculatePriceChangePercent(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return newPrice === 0 ? 0 : 100;
  return round2(((newPrice - oldPrice) / oldPrice) * 100);
}

export function isSignificantPriceChange(changePercent: number): boolean {
  return Math.abs(changePercent) >= SIGNIFICANT_PRICE_CHANGE_THRESHOLD_PERCENT;
}
