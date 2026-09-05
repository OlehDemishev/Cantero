import { calculateEac, type EacResult } from "../reports/estimate-at-completion";

export interface CostCodeEacInput {
  estimated: number;
  committed: number;
  actual: number;
  /** 0-100, the project's overall progress-billing percentComplete — see reports.service.ts estimateAtCompletion(). */
  percentComplete: number;
}

export type CostCodeEacResult = Pick<EacResult, "earnedValue" | "costPerformanceIndex" | "estimateAtCompletion" | "varianceAtCompletion">;

/**
 * Per-cost-code EAC forecast, reusing the same EVM math as the whole-project
 * estimateAtCompletion() report with the cost code's own estimated cost as the budget basis and
 * committed+actual as cost incurred so far. Margin/contract-value fields from the underlying
 * calculateEac() are intentionally dropped here — a single cost code has no revenue apportioned
 * to it independently of the rest of the estimate, so "margin" isn't a meaningful concept at this
 * granularity, only the cost/schedule projection is.
 */
export function calculateCostCodeEac({ estimated, committed, actual, percentComplete }: CostCodeEacInput): CostCodeEacResult {
  const { earnedValue, costPerformanceIndex, estimateAtCompletion, varianceAtCompletion } = calculateEac({
    contractValue: 0,
    budgetedCost: estimated,
    actualCost: committed + actual,
    percentComplete,
  });
  return { earnedValue, costPerformanceIndex, estimateAtCompletion, varianceAtCompletion };
}
