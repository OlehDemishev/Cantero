const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BurdenComponents {
  payrollTaxBurdenPercent: number | null;
  workersCompBurdenPercent: number | null;
  benefitsBurdenPercent: number | null;
  otherBurdenPercent: number | null;
}

export interface LoadedLaborRateResult {
  baseRate: number;
  /** Sum of every set component, as a percentage of baseRate. */
  totalBurdenPercent: number;
  burdenAmount: number;
  loadedRate: number;
}

/**
 * The fully-loaded hourly cost of a worker: base wage plus employer-side payroll tax, workers'
 * comp, benefits, and any other burden — each company-wide percentage, not per-worker, since
 * these are jurisdiction/policy rates rather than something that varies person to person. An
 * unset component contributes 0, same as leaving Company.lateFeePercentPerMonth null disables
 * late fees rather than erroring.
 */
export function calculateLoadedLaborRate(baseRate: number, components: BurdenComponents): LoadedLaborRateResult {
  const totalBurdenPercent = round2(
    (components.payrollTaxBurdenPercent ?? 0) +
      (components.workersCompBurdenPercent ?? 0) +
      (components.benefitsBurdenPercent ?? 0) +
      (components.otherBurdenPercent ?? 0),
  );
  const burdenAmount = round2(baseRate * (totalBurdenPercent / 100));

  return {
    baseRate: round2(baseRate),
    totalBurdenPercent,
    burdenAmount,
    loadedRate: round2(baseRate + burdenAmount),
  };
}
