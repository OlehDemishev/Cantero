const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ObservationEntry {
  category: "safe" | "at_risk";
}

export interface SafeObservationRateResult {
  totalCount: number;
  safeCount: number;
  atRiskCount: number;
  /** 0-100, null with no observations logged yet — a rate of 0 would misleadingly read as "all at-risk". */
  safePercent: number | null;
}

/** The core BBS leading-indicator metric: what share of logged behaviors were safe vs. at-risk. */
export function calculateSafeObservationRate(entries: ObservationEntry[]): SafeObservationRateResult {
  const safeCount = entries.filter((e) => e.category === "safe").length;
  const atRiskCount = entries.filter((e) => e.category === "at_risk").length;
  const totalCount = entries.length;

  return {
    totalCount,
    safeCount,
    atRiskCount,
    safePercent: totalCount > 0 ? round2((safeCount / totalCount) * 100) : null,
  };
}
