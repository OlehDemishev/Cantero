export const WEEKLY_OVERTIME_THRESHOLD_HOURS = 40;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PayrollTimeEntry {
  workerId: string;
  hours: number;
  date: Date;
}

export interface PayrollHoursLine {
  workerId: string;
  regularHours: number;
  overtimeHours: number;
}

/** Sunday-anchored week start (UTC) — the default ADP/Gusto pay-period week boundary. */
function startOfWeekUtc(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start.getTime();
}

/**
 * Regular/overtime hours per worker across a pay period, applying the weekly 40-hour FLSA
 * threshold per calendar week rather than over the whole period — a two-week pay period with
 * 45 hours in week one and 35 in week two nets 5 overtime hours, not 0 (80 total is under 40×2).
 * Same weekly-threshold approach certified-payroll's computeWeek() uses, generalized across
 * however many weeks the period spans and across all of a worker's projects, not just one.
 */
export function calculatePayrollHours(entries: PayrollTimeEntry[]): PayrollHoursLine[] {
  const byWorkerWeek = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.workerId}|${startOfWeekUtc(entry.date)}`;
    byWorkerWeek.set(key, (byWorkerWeek.get(key) ?? 0) + entry.hours);
  }

  const totals = new Map<string, { regularHours: number; overtimeHours: number }>();
  for (const [key, weekHours] of byWorkerWeek) {
    const workerId = key.slice(0, key.indexOf("|"));
    const regular = Math.min(weekHours, WEEKLY_OVERTIME_THRESHOLD_HOURS);
    const overtime = Math.max(0, weekHours - WEEKLY_OVERTIME_THRESHOLD_HOURS);
    const line = totals.get(workerId) ?? { regularHours: 0, overtimeHours: 0 };
    line.regularHours = round2(line.regularHours + regular);
    line.overtimeHours = round2(line.overtimeHours + overtime);
    totals.set(workerId, line);
  }

  return Array.from(totals.entries()).map(([workerId, line]) => ({ workerId, ...line }));
}
