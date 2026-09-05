const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface WinRateEstimateInput {
  clientDecision: "pending" | "approved" | "rejected" | "countered";
  grandTotal: number;
  sentAt: Date | null;
  decisionAt: Date | null;
}

export interface WinRateResult {
  decidedCount: number;
  wonCount: number;
  lostCount: number;
  /** 0-100, null when nothing has been decided yet — a rate of 0 would misleadingly read as "always losing". */
  winRatePercent: number | null;
  wonValue: number;
  lostValue: number;
  /** Mean calendar days between send and decision, across decided estimates only; null with no data. */
  averageDaysToDecision: number | null;
}

/**
 * Win rate is measured only against estimates the client has actually decided on — pending and
 * countered estimates are excluded from the denominator since they haven't reached a final
 * outcome yet (a countered offer that's later approved or rejected will count then, not now).
 */
export function calculateWinRate(estimates: WinRateEstimateInput[]): WinRateResult {
  const decided = estimates.filter((e) => e.clientDecision === "approved" || e.clientDecision === "rejected");
  const won = decided.filter((e) => e.clientDecision === "approved");
  const lost = decided.filter((e) => e.clientDecision === "rejected");

  const daySpans = decided
    .filter((e) => e.sentAt !== null && e.decisionAt !== null)
    .map((e) => (e.decisionAt!.getTime() - e.sentAt!.getTime()) / (24 * 60 * 60 * 1000));

  return {
    decidedCount: decided.length,
    wonCount: won.length,
    lostCount: lost.length,
    winRatePercent: decided.length > 0 ? round2((won.length / decided.length) * 100) : null,
    wonValue: round2(won.reduce((sum, e) => sum + e.grandTotal, 0)),
    lostValue: round2(lost.reduce((sum, e) => sum + e.grandTotal, 0)),
    averageDaysToDecision: daySpans.length > 0 ? round2(daySpans.reduce((sum, d) => sum + d, 0) / daySpans.length) : null,
  };
}
