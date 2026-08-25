import { calculateEac } from "./estimate-at-completion";

describe("calculateEac", () => {
  it("projects on-budget completion when spend exactly tracks earned value", () => {
    const result = calculateEac({ contractValue: 120000, budgetedCost: 100000, actualCost: 50000, percentComplete: 50 });

    expect(result).toEqual({
      earnedValue: 50000,
      costPerformanceIndex: 1,
      estimateAtCompletion: 100000,
      varianceAtCompletion: 0,
      budgetedMarginPercent: 16.67,
      projectedMarginPercent: 16.67,
      marginErosionPercent: 0,
    });
  });

  it("projects a cost overrun and eroded margin when spend outpaces earned value", () => {
    const result = calculateEac({ contractValue: 120000, budgetedCost: 100000, actualCost: 60000, percentComplete: 50 });

    expect(result.costPerformanceIndex).toBe(0.83);
    expect(result.estimateAtCompletion).toBe(120240.96);
    expect(result.varianceAtCompletion).toBe(-20240.96);
    expect(result.projectedMarginPercent).toBe(-0.2);
    expect(result.marginErosionPercent).toBe(16.87);
  });

  it("projects a favorable variance and margin gain when spend is more efficient than earned value", () => {
    const result = calculateEac({ contractValue: 120000, budgetedCost: 100000, actualCost: 40000, percentComplete: 50 });

    expect(result.costPerformanceIndex).toBe(1.25);
    expect(result.estimateAtCompletion).toBe(80000);
    expect(result.varianceAtCompletion).toBe(20000);
    expect(result.projectedMarginPercent).toBe(33.33);
    expect(result.marginErosionPercent).toBe(-16.66);
  });

  it("falls back to the original budgeted cost — not a division by zero — when there's no actual cost yet", () => {
    const result = calculateEac({ contractValue: 120000, budgetedCost: 100000, actualCost: 0, percentComplete: 0 });

    expect(result.costPerformanceIndex).toBeNull();
    expect(result.estimateAtCompletion).toBe(100000);
    expect(result.varianceAtCompletion).toBe(0);
    expect(result.projectedMarginPercent).toBe(result.budgetedMarginPercent);
  });

  it("returns null margins when there's no contract value to divide by", () => {
    const result = calculateEac({ contractValue: 0, budgetedCost: 100000, actualCost: 50000, percentComplete: 50 });

    expect(result.budgetedMarginPercent).toBeNull();
    expect(result.projectedMarginPercent).toBeNull();
    expect(result.marginErosionPercent).toBeNull();
  });
});
