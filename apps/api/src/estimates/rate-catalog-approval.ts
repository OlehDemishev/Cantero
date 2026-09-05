export interface RateChangeApprovalInput {
  currentLaborHoursPerUnit: number;
  /** undefined means laborHoursPerUnit isn't part of this edit at all. */
  newLaborHoursPerUnit: number | undefined;
  /** Company.rateCatalogApprovalThresholdPercent — null means gating is off, every edit applies immediately. */
  thresholdPercent: number | null;
}

/**
 * Decides whether a RateCatalogItem edit's labor-hours swing is big enough to hold for approval
 * rather than applying immediately — see RateCatalogService.update(). A current value of 0 makes
 * percent-change undefined, so any nonzero new value there is treated as requiring approval
 * (going from "free" to "costs something" is exactly the kind of swing the gate exists to catch),
 * while 0 -> 0 is not a change at all.
 */
export function rateChangeRequiresApproval({ currentLaborHoursPerUnit, newLaborHoursPerUnit, thresholdPercent }: RateChangeApprovalInput): boolean {
  if (thresholdPercent === null || newLaborHoursPerUnit === undefined) return false;
  if (newLaborHoursPerUnit === currentLaborHoursPerUnit) return false;

  if (currentLaborHoursPerUnit === 0) return newLaborHoursPerUnit !== 0;

  const percentChange = (Math.abs(newLaborHoursPerUnit - currentLaborHoursPerUnit) / currentLaborHoursPerUnit) * 100;
  return percentChange > thresholdPercent;
}
