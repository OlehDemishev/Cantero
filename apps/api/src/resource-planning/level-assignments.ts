export interface AssignmentForLeveling {
  id: string;
  startDate: Date;
  endDate: Date;
}
export interface LevelingMoveResult {
  id: string;
  startDate: Date;
  endDate: Date;
  shiftedByDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Greedy single-resource leveling: sorts a resource's assignments by start date, and whenever the
 * next one would start before the previous (as leveled) one ends, pushes it out to start right
 * after — preserving its original duration. This resolves *all* pairwise overlaps for the
 * resource in one pass (each assignment is only ever pushed later, never earlier), at the cost of
 * potentially compressing the whole chain later than an optimizer that reordered work would.
 * Assignments that don't move are still returned, with shiftedByDays: 0, so the caller can tell
 * "nothing needed to move" from "conflicts were resolved."
 */
export function levelAssignments(assignments: AssignmentForLeveling[]): LevelingMoveResult[] {
  const sorted = [...assignments].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const results: LevelingMoveResult[] = [];
  let cursor: Date | null = null;

  for (const a of sorted) {
    const durationMs = a.endDate.getTime() - a.startDate.getTime();
    const newStart: Date = cursor && a.startDate.getTime() < cursor.getTime() ? cursor : a.startDate;
    const newEnd = new Date(newStart.getTime() + durationMs);
    const shiftedByDays = Math.round((newStart.getTime() - a.startDate.getTime()) / DAY_MS);
    results.push({ id: a.id, startDate: newStart, endDate: newEnd, shiftedByDays });
    cursor = newEnd;
  }

  return results;
}
