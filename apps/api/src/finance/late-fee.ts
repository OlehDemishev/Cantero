const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Simple (non-compounding) monthly-rate accrual — daysOverdue / 30 gives fractional months, so a
 * balance overdue half a month accrues half the monthly rate. Never negative: a non-overdue or
 * already-settled balance accrues nothing. */
export function calculateLateFee(outstandingBalance: number, daysOverdue: number, percentPerMonth: number): number {
  if (outstandingBalance <= 0 || daysOverdue <= 0 || percentPerMonth <= 0) return 0;
  const monthsOverdue = daysOverdue / 30;
  return round2(outstandingBalance * (percentPerMonth / 100) * monthsOverdue);
}

export function daysOverdue(dueDate: Date, asOf: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay));
}
