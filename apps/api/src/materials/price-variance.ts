export interface PriceVarianceLine {
  unitPrice: number;
  quantity: number;
  /** The material's catalog benchmark price to compare against — see suppliers.service.ts scorecard(). */
  catalogPrice: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Quantity-weighted average of (unitPrice - catalogPrice) / catalogPrice across every line, as a
 * percentage — positive means this supplier tends to price above catalog, negative below. A line
 * whose catalogPrice is 0 is excluded (division by zero, and a free catalog benchmark isn't a
 * meaningful price to vary against) rather than distorting the average. Null when there are no
 * priceable lines at all, so "priced exactly at catalog on average" (0) reads differently from
 * "no price data" (null).
 */
export function calculatePriceVariance(lines: PriceVarianceLine[]): number | null {
  const priceable = lines.filter((l) => l.catalogPrice > 0 && l.quantity > 0);
  if (priceable.length === 0) return null;

  const totalQuantity = priceable.reduce((sum, l) => sum + l.quantity, 0);
  const weightedVarianceSum = priceable.reduce((sum, l) => sum + l.quantity * (((l.unitPrice - l.catalogPrice) / l.catalogPrice) * 100), 0);

  return round1(weightedVarianceSum / totalQuantity);
}
