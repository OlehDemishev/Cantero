import type { AllowanceStatus } from "@cantero/shared";

/**
 * A closed allowance stays closed regardless of further charges — closing is the deliberate
 * "reconciliation is final" action (see AllowancesService.close), not something a later charge
 * should silently reopen. Otherwise the status simply reflects whether charges have run past the
 * budgeted amount.
 */
export function computeAllowanceStatus(budgetedAmount: number, spentAmount: number, currentStatus: AllowanceStatus): AllowanceStatus {
  if (currentStatus === "closed") return "closed";
  return spentAmount > budgetedAmount ? "exceeded" : "active";
}
