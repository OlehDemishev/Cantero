/** Sunday=0 .. Saturday=6, matching Date.getUTCDay() — dates are compared in UTC throughout so a
 * holiday entered as a plain calendar date lines up regardless of the server's local timezone. */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** false for a weekend or a date present in holidayDates (as YYYY-MM-DD keys) — everything else
 * (including a date with no holiday configured at all) counts as a working day. */
export function isWorkingDay(date: Date, holidayDates: ReadonlySet<string>): boolean {
  if (isWeekend(date)) return false;
  return !holidayDates.has(toDateKey(date));
}
