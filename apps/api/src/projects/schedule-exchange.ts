import type { TaskDependencyType, TaskStatus } from "@prisma/client";

/** Format-neutral schedule shape both file formats (MSPDI, XER) parse into and build from, so the
 * import/export service has one code path regardless of which tool the file came from. Summary/WBS
 * rows are dropped at parse time: Cantero's Task has no hierarchy, so a rolled-up summary row would
 * just duplicate the tasks underneath it. */
export interface ExchangeTask {
  /** Opaque id unique within the file — used only to wire dependencies together. */
  uid: string;
  name: string;
  startDate: Date | null;
  finishDate: Date | null;
  status: TaskStatus;
  isMilestone: boolean;
}

export interface ExchangeDependency {
  predecessorUid: string;
  successorUid: string;
  type: TaskDependencyType;
  lagDays: number;
}

export interface ExchangeSchedule {
  name: string;
  tasks: ExchangeTask[];
  dependencies: ExchangeDependency[];
}

export const HOURS_PER_WORKDAY = 8;

/** Keeps only the calendar date, as UTC midnight — the file formats carry working-hour times
 * (08:00/17:00) that mean nothing to Cantero's date-only scheduling, and dropping them here keeps
 * a date from drifting across a day boundary depending on the server's timezone. */
export function dateOnly(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive Mon–Fri day count between two dates (at least 1 for a same-day task) — an export
 * approximation of duration; Cantero doesn't store one, only start and due. */
export function workingDaysInclusive(start: Date, finish: Date): number {
  let count = 0;
  for (let t = start.getTime(); t <= finish.getTime(); t += 24 * 60 * 60 * 1000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return Math.max(1, count);
}

export function statusFromPercent(percent: number): TaskStatus {
  if (percent >= 100) return "done";
  if (percent > 0) return "in_progress";
  return "planned";
}

export function percentFromStatus(status: TaskStatus): number {
  return status === "done" ? 100 : status === "in_progress" ? 50 : 0;
}
