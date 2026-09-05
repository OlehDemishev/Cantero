export interface BackchargeForRecovery {
  amount: number;
  status: "pending" | "deducted" | "waived";
}
export interface WarrantyRecovery {
  /** Sum of backcharges actually deducted from the subcontractor — the only amount genuinely recovered so far. */
  recoveredAmount: number;
  /** Sum of backcharges still pending, not yet deducted or waived. */
  pendingAmount: number;
  /** recoveredAmount / repairCost, as a percentage — null when repairCost is null or 0 (nothing to recover against). */
  recoveryPercent: number | null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * How much of a warranty claim's repair cost has actually been recovered from a subcontractor via
 * linked backcharges — waived backcharges count toward neither recovered nor pending, since the
 * company gave up on collecting them.
 */
export function calculateWarrantyRecovery(repairCost: number | null, backcharges: BackchargeForRecovery[]): WarrantyRecovery {
  const recoveredAmount = round2(backcharges.filter((b) => b.status === "deducted").reduce((sum, b) => sum + b.amount, 0));
  const pendingAmount = round2(backcharges.filter((b) => b.status === "pending").reduce((sum, b) => sum + b.amount, 0));
  const recoveryPercent = repairCost !== null && repairCost > 0 ? round2((recoveredAmount / repairCost) * 100) : null;

  return { recoveredAmount, pendingAmount, recoveryPercent };
}
