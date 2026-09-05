const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AlternateEntry {
  status: "pending" | "accepted" | "rejected";
  amount: number;
}

export interface AlternatesTotalResult {
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  /** Sum of accepted alternates' amounts — positive if net additive, negative if net deductive. */
  acceptedTotal: number;
}

/** Rolls up an estimate's alternates into the net delta accepted so far — informational only,
 * never merged into Estimate.grandTotal, which the line-item calc engine owns exclusively. */
export function calculateAlternatesTotal(alternates: AlternateEntry[]): AlternatesTotalResult {
  const accepted = alternates.filter((a) => a.status === "accepted");
  return {
    pendingCount: alternates.filter((a) => a.status === "pending").length,
    acceptedCount: accepted.length,
    rejectedCount: alternates.filter((a) => a.status === "rejected").length,
    acceptedTotal: round2(accepted.reduce((sum, a) => sum + a.amount, 0)),
  };
}
