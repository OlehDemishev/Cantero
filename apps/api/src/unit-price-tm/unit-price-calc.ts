const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface UnitPriceBillingSummary {
  totalQuantityInstalled: number;
  totalBilled: number;
  varianceFromEstimate: number | null;
}

/**
 * Sums every field measurement into the quantity actually installed, then bills that against the
 * fixed contract unit price — the field measurement drives billing, not the original estimate.
 * varianceFromEstimate is null when the item was never given an estimated quantity to compare
 * against (unit-price items don't require one, unlike a lump-sum estimate line).
 */
export function calculateUnitPriceBilling(
  measuredQuantities: number[],
  contractUnitPrice: number,
  estimatedQuantity: number | null,
): UnitPriceBillingSummary {
  const totalQuantityInstalled = round2(measuredQuantities.reduce((sum, q) => sum + q, 0));
  return {
    totalQuantityInstalled,
    totalBilled: round2(totalQuantityInstalled * contractUnitPrice),
    varianceFromEstimate: estimatedQuantity !== null ? round2(totalQuantityInstalled - estimatedQuantity) : null,
  };
}
