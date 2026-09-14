/** Adds calendar months without JS Date's own overflow behavior (Jan 31 + 1 month silently
 * becomes Mar 3, not Feb 28/29 — `Date.setMonth`/`setUTCMonth` roll a nonexistent day into the
 * following month instead of clamping). A date that's on the last day of its own month (the
 * 31st, Feb 28/29, ...) keeps targeting the target month's own last day on every subsequent call
 * — not just clamped to the same day-number once — so something anchored to month-end (a
 * recurring invoice, a warranty or certification expiry, a service-contract visit date) actually
 * stays on month-end (Jan 31 → Feb 28 → Mar 31 → Apr 30 → ...) instead of drifting onto whatever
 * day the first short month happened to clamp it to and getting stuck there. A date NOT on its
 * month's last day (e.g. the 15th) just clamps to the target month's last day on the rare month
 * that's shorter than expected. Operates in UTC to avoid local-timezone/DST drift on repeated
 * calls; pass a UTC-normalized Date in and read UTC fields back out. */
export function addMonthsUtc(date: Date, monthsToAdd: number): Date {
  const day = date.getUTCDate();
  const daysInCurrentMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const wasLastDayOfMonth = day === daysInCurrentMonth;

  const next = new Date(date);
  next.setUTCDate(1); // park on a day that exists in every month while the month itself shifts
  next.setUTCMonth(next.getUTCMonth() + monthsToAdd);
  const daysInTargetMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(wasLastDayOfMonth ? daysInTargetMonth : Math.min(day, daysInTargetMonth));
  return next;
}
