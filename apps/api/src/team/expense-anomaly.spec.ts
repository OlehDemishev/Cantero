import { detectExpenseAnomaly } from "./expense-anomaly";

describe("detectExpenseAnomaly", () => {
  it("reports not-enough-history below the minimum sample size", () => {
    expect(detectExpenseAnomaly(500, [100, 120])).toEqual({
      isAnomaly: false,
      historicalAverage: null,
      historicalSampleSize: 2,
      deviationPercent: null,
    });
  });

  it("does not flag an amount close to the historical average", () => {
    const result = detectExpenseAnomaly(105, [100, 110, 95, 100, 105]);
    expect(result.isAnomaly).toBe(false);
  });

  it("flags an amount far beyond the historical mean and stddev", () => {
    const result = detectExpenseAnomaly(1000, [100, 110, 95, 100, 105]);
    expect(result.isAnomaly).toBe(true);
    expect(result.historicalAverage).toBeCloseTo(102, 0);
    expect(result.deviationPercent).toBeGreaterThan(800);
  });

  it("does not flag a mild overage even if technically above a zero-variance mean*2 threshold guard", () => {
    // identical history (zero stddev) — threshold falls back to mean*2, and the 1.2x guard still applies
    const result = detectExpenseAnomaly(150, [100, 100, 100]);
    expect(result.isAnomaly).toBe(false);
  });

  it("flags a clear outlier against identical zero-variance history", () => {
    const result = detectExpenseAnomaly(250, [100, 100, 100]);
    expect(result.isAnomaly).toBe(true);
  });
});
