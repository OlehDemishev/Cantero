const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TcoInput {
  fuelCost: number;
  maintenanceCost: number;
  accumulatedDepreciation: number;
  hoursElapsed: number;
}

export interface TcoResult {
  totalCost: number;
  /** null when there's no logged meter-hour span to divide by. */
  costPerHour: number | null;
  fuelSharePercent: number | null;
  maintenanceSharePercent: number | null;
  depreciationSharePercent: number | null;
}

/** Combines equipment-cost.ts's fuel+maintenance rollup with equipment-depreciation.ts's book-value
 * loss into one total-cost-of-ownership figure — the number that actually drives a buy/rent/replace
 * decision, which neither piece alone answers. */
export function calculateTotalCostOfOwnership(input: TcoInput): TcoResult {
  const totalCost = round2(input.fuelCost + input.maintenanceCost + input.accumulatedDepreciation);
  const costPerHour = input.hoursElapsed > 0 ? round2(totalCost / input.hoursElapsed) : null;
  const share = (part: number) => (totalCost > 0 ? round2((part / totalCost) * 100) : null);

  return {
    totalCost,
    costPerHour,
    fuelSharePercent: share(input.fuelCost),
    maintenanceSharePercent: share(input.maintenanceCost),
    depreciationSharePercent: share(input.accumulatedDepreciation),
  };
}
