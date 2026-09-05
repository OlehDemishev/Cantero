import { calculateLoadedLaborRate } from "./labor-burden";

describe("calculateLoadedLaborRate", () => {
  it("sums every set burden component onto the base rate", () => {
    const result = calculateLoadedLaborRate(30, {
      payrollTaxBurdenPercent: 10,
      workersCompBurdenPercent: 8,
      benefitsBurdenPercent: 12,
      otherBurdenPercent: null,
    });
    expect(result.totalBurdenPercent).toBe(30);
    expect(result.burdenAmount).toBe(9);
    expect(result.loadedRate).toBe(39);
  });

  it("treats every unset component as zero, returning the base rate unchanged", () => {
    const result = calculateLoadedLaborRate(25, {
      payrollTaxBurdenPercent: null,
      workersCompBurdenPercent: null,
      benefitsBurdenPercent: null,
      otherBurdenPercent: null,
    });
    expect(result.totalBurdenPercent).toBe(0);
    expect(result.loadedRate).toBe(25);
  });

  it("handles a single component set", () => {
    const result = calculateLoadedLaborRate(40, {
      payrollTaxBurdenPercent: null,
      workersCompBurdenPercent: null,
      benefitsBurdenPercent: 20,
      otherBurdenPercent: null,
    });
    expect(result.loadedRate).toBe(48);
  });
});
