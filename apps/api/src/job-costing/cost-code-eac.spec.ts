import { calculateCostCodeEac } from "./cost-code-eac";

describe("calculateCostCodeEac", () => {
  it("projects an overrun when cost incurred so far is running ahead of earned value", () => {
    const result = calculateCostCodeEac({ estimated: 10000, committed: 0, actual: 6000, percentComplete: 50 });

    expect(result.earnedValue).toBe(5000);
    expect(result.costPerformanceIndex).toBeCloseTo(5000 / 6000);
    expect(result.estimateAtCompletion).toBeGreaterThan(10000);
    expect(result.varianceAtCompletion).toBeLessThan(0);
  });

  it("treats committed cost the same as actual cost incurred for the CPI basis", () => {
    const committedOnly = calculateCostCodeEac({ estimated: 10000, committed: 6000, actual: 0, percentComplete: 50 });
    const actualOnly = calculateCostCodeEac({ estimated: 10000, committed: 0, actual: 6000, percentComplete: 50 });
    expect(committedOnly).toEqual(actualOnly);
  });

  it("falls back to the estimated cost when nothing has been spent yet", () => {
    const result = calculateCostCodeEac({ estimated: 10000, committed: 0, actual: 0, percentComplete: 0 });
    expect(result.costPerformanceIndex).toBeNull();
    expect(result.estimateAtCompletion).toBe(10000);
    expect(result.varianceAtCompletion).toBe(0);
  });

  it("does not expose margin/contract-value fields — not meaningful at cost-code granularity", () => {
    const result = calculateCostCodeEac({ estimated: 10000, committed: 0, actual: 5000, percentComplete: 50 });
    expect(result).not.toHaveProperty("budgetedMarginPercent");
    expect(result).not.toHaveProperty("projectedMarginPercent");
    expect(result).not.toHaveProperty("marginErosionPercent");
  });
});
