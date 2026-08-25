const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface EacInput {
  /** Contract value — what the client pays (grandTotal of approved estimates, already includes markup/tax). */
  contractValue: number;
  /** Budgeted cost — what the estimate planned to spend (materials + labor, pre-markup). */
  budgetedCost: number;
  /** Actual cost incurred to date (materials + labor + subcontractor spend). */
  actualCost: number;
  /** 0-100, from progress-billing draws — 0 (and therefore a conservative EAC) when no draw exists yet. */
  percentComplete: number;
}

export interface EacResult {
  earnedValue: number;
  /** null when there's no actual cost yet to measure efficiency against. */
  costPerformanceIndex: number | null;
  /** Projected total cost at completion. */
  estimateAtCompletion: number;
  /** budgetedCost - EAC: positive means projected to come in under budget. */
  varianceAtCompletion: number;
  budgetedMarginPercent: number | null;
  projectedMarginPercent: number | null;
  /** budgetedMarginPercent - projectedMarginPercent: positive means margin is eroding. */
  marginErosionPercent: number | null;
}

/**
 * Standard EVM estimate-at-completion, assuming the remaining work continues at the same cost
 * efficiency (CPI) observed so far — the industry-default EAC formula for a project where scope
 * hasn't fundamentally changed. Falls back to the original budgeted cost (i.e. "assume on-plan")
 * when there isn't enough data yet (no actual cost, or CPI computes to zero) rather than
 * fabricating a division-by-zero result.
 */
export function calculateEac({ contractValue, budgetedCost, actualCost, percentComplete }: EacInput): EacResult {
  const earnedValue = round2(budgetedCost * (percentComplete / 100));
  const costPerformanceIndex = actualCost > 0 ? round2(earnedValue / actualCost) : null;

  const estimateAtCompletion =
    costPerformanceIndex && costPerformanceIndex > 0
      ? round2(actualCost + (budgetedCost - earnedValue) / costPerformanceIndex)
      : round2(budgetedCost);

  const varianceAtCompletion = round2(budgetedCost - estimateAtCompletion);
  const budgetedMarginPercent = contractValue > 0 ? round2(((contractValue - budgetedCost) / contractValue) * 100) : null;
  const projectedMarginPercent = contractValue > 0 ? round2(((contractValue - estimateAtCompletion) / contractValue) * 100) : null;
  const marginErosionPercent =
    budgetedMarginPercent !== null && projectedMarginPercent !== null
      ? round2(budgetedMarginPercent - projectedMarginPercent)
      : null;

  return {
    earnedValue,
    costPerformanceIndex,
    estimateAtCompletion,
    varianceAtCompletion,
    budgetedMarginPercent,
    projectedMarginPercent,
    marginErosionPercent,
  };
}
