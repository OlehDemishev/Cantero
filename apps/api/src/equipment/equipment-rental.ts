const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RentalRevenueInput {
  dailyRate: number;
  startDate: Date;
  /** The rental's actualReturnDate if it's closed, otherwise "now" — an open rental's revenue is
   * a running total as of the moment it's viewed, not a final figure. */
  asOf: Date;
}

export interface RentalRevenueResult {
  /** Always at least 1 — a rental started and checked at any point on the same day still owes a
   * day's rate, same "don't fabricate a zero" reasoning as elsewhere in this module. */
  daysElapsed: number;
  revenue: number;
}

export function calculateRentalRevenue({ dailyRate, startDate, asOf }: RentalRevenueInput): RentalRevenueResult {
  const daysElapsed = Math.max(1, Math.ceil((asOf.getTime() - startDate.getTime()) / DAY_MS));
  return { daysElapsed, revenue: round2(dailyRate * daysElapsed) };
}
