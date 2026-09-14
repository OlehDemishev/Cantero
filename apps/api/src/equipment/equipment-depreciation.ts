const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DepreciationInput {
  cost: number;
  purchaseDate: Date;
  method: "straight_line" | "declining_balance";
  usefulLifeMonths: number;
  salvageValue: number;
  asOf: Date;
}

export interface DepreciationResult {
  monthsElapsed: number;
  accumulatedDepreciation: number;
  bookValue: number;
}

// UTC, not local calendar: purchaseDate/asOf arrive as UTC-midnight timestamps, and reading them
// back with local getFullYear()/getMonth() on a server behind UTC misclassifies which month a
// date near a month boundary falls in — e.g. an asset purchased Jan 1 and evaluated Jan 15 would
// read as "1 month elapsed" instead of 0, overstating accumulated depreciation.
function monthsBetween(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, months);
}

/**
 * Straight-line depreciates (cost - salvage) evenly over usefulLifeMonths. Declining-balance
 * uses the double-declining-balance method (monthly rate = 2 / usefulLifeMonths applied to the
 * prior month's book value, month by month) since it doesn't have a closed-form monthly formula
 * the way straight-line does — usefulLifeMonths is capped at 600 (50 years) by the input schema,
 * so the loop is always small. Both methods floor accumulated depreciation so book value never
 * drops below salvageValue, and both cap monthsElapsed at usefulLifeMonths — depreciation stops
 * once the asset is fully depreciated, it doesn't go negative past its useful life.
 */
export function calculateDepreciation({ cost, purchaseDate, method, usefulLifeMonths, salvageValue, asOf }: DepreciationInput): DepreciationResult {
  const monthsElapsed = Math.min(monthsBetween(purchaseDate, asOf), usefulLifeMonths);
  const depreciableBase = Math.max(0, cost - salvageValue);

  if (method === "straight_line") {
    const monthlyDepreciation = usefulLifeMonths > 0 ? depreciableBase / usefulLifeMonths : 0;
    const accumulatedDepreciation = round2(Math.min(monthlyDepreciation * monthsElapsed, depreciableBase));
    return { monthsElapsed, accumulatedDepreciation, bookValue: round2(cost - accumulatedDepreciation) };
  }

  const monthlyRate = usefulLifeMonths > 0 ? 2 / usefulLifeMonths : 0;
  let bookValue = cost;
  for (let month = 0; month < monthsElapsed; month++) {
    const depreciationThisMonth = bookValue * monthlyRate;
    bookValue = Math.max(salvageValue, bookValue - depreciationThisMonth);
  }
  return { monthsElapsed, accumulatedDepreciation: round2(cost - bookValue), bookValue: round2(bookValue) };
}
