export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ProgressDrawCalc {
  grossAmount: number;
  retainageAmount: number;
  netAmount: number;
}

/**
 * Computes one progress-billing draw: the incremental slice of the contract earned since the
 * last draw (percentComplete - previousPercentBilled), minus retainage withheld on that slice.
 * Draws are billed against the estimate's grandTotal directly (which already includes tax), so
 * no separate tax line is added per draw — that avoids taxing the same amount twice across draws.
 */
export function calculateProgressDraw(
  contractTotal: number,
  previousPercentBilled: number,
  percentComplete: number,
  retainagePercent: number,
): ProgressDrawCalc {
  const grossAmount = round2((contractTotal * (percentComplete - previousPercentBilled)) / 100);
  const retainageAmount = round2(grossAmount * (retainagePercent / 100));
  const netAmount = round2(grossAmount - retainageAmount);
  return { grossAmount, retainageAmount, netAmount };
}
