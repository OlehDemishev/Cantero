const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CommitmentEntry {
  status: "committed" | "completed" | "missed";
}

export interface PpcResult {
  committedCount: number;
  completedCount: number;
  missedCount: number;
  /** Still-open commitments for a week that hasn't been resolved yet — excluded from the PPC ratio itself. */
  openCount: number;
  /** completed / (completed + missed) as a percentage, 0-100 — the standard lean-construction
   * percent-plan-complete metric. Null when nothing has been resolved yet (still-open commitments
   * don't count as either a hit or a miss). */
  ppcPercent: number | null;
}

/** Percent Plan Complete: of the commitments actually resolved (completed or missed), what share hit. */
export function calculatePpc(entries: CommitmentEntry[]): PpcResult {
  const completedCount = entries.filter((e) => e.status === "completed").length;
  const missedCount = entries.filter((e) => e.status === "missed").length;
  const openCount = entries.filter((e) => e.status === "committed").length;
  const resolvedCount = completedCount + missedCount;

  return {
    committedCount: entries.length,
    completedCount,
    missedCount,
    openCount,
    ppcPercent: resolvedCount > 0 ? round2((completedCount / resolvedCount) * 100) : null,
  };
}
