const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds the cure period to the notice date — null when no cure period was granted (immediate default). */
export function calculateCureDeadline(noticeDate: Date, curePeriodDays: number | null): Date | null {
  if (curePeriodDays === null) return null;
  return new Date(noticeDate.getTime() + curePeriodDays * DAY_MS);
}

/** Whether a cure deadline has passed as of `now` — a notice with no deadline is never "past due" via this check. */
export function isPastCureDeadline(cureDeadline: Date | null, now: Date): boolean {
  if (cureDeadline === null) return false;
  return now.getTime() > cureDeadline.getTime();
}
