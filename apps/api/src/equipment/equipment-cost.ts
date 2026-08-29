const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CostPerHourInput {
  totalFuelCost: number;
  totalMaintenanceCost: number;
  /** Span between the earliest and latest logged meter reading across fuel logs + maintenance
   * records — the only usage-measurement data this app has, since there's no
   * hours-at-acquisition baseline on Equipment. */
  hoursElapsed: number;
}

export interface CostPerHourResult {
  totalCost: number;
  /** null when there isn't at least two distinct meter readings to measure elapsed hours against —
   * same "don't fabricate a division-by-zero result" reasoning as calculateEac. */
  costPerHour: number | null;
}

export function calculateCostPerHour({ totalFuelCost, totalMaintenanceCost, hoursElapsed }: CostPerHourInput): CostPerHourResult {
  const totalCost = round2(totalFuelCost + totalMaintenanceCost);
  return {
    totalCost,
    costPerHour: hoursElapsed > 0 ? round2(totalCost / hoursElapsed) : null,
  };
}
