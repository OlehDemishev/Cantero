import { calculateSafeObservationRate } from "./safe-observation-rate";

describe("calculateSafeObservationRate", () => {
  it("computes the safe percentage across mixed observations", () => {
    const result = calculateSafeObservationRate([{ category: "safe" }, { category: "safe" }, { category: "at_risk" }]);
    expect(result.totalCount).toBe(3);
    expect(result.safeCount).toBe(2);
    expect(result.atRiskCount).toBe(1);
    expect(result.safePercent).toBeCloseTo(66.67, 1);
  });

  it("returns null when there are no observations yet", () => {
    const result = calculateSafeObservationRate([]);
    expect(result.safePercent).toBeNull();
  });

  it("is 100 when every observation is safe", () => {
    const result = calculateSafeObservationRate([{ category: "safe" }, { category: "safe" }]);
    expect(result.safePercent).toBe(100);
  });
});
