import { calculateFxSettlement } from "./fx-settlement";

describe("calculateFxSettlement", () => {
  it("reports a gain when the actual rate beats the benchmark", () => {
    const result = calculateFxSettlement({ foreignAmount: 1000, actualRate: 1.1, benchmarkRate: 1.08 });
    expect(result.convertedAmount).toBe(1100);
    expect(result.benchmarkAmount).toBe(1080);
    expect(result.gainLoss).toBe(20);
  });

  it("reports a loss when the actual rate is worse than the benchmark", () => {
    const result = calculateFxSettlement({ foreignAmount: 1000, actualRate: 1.05, benchmarkRate: 1.08 });
    expect(result.gainLoss).toBe(-30);
  });

  it("reports zero gain/loss when the actual rate matches the benchmark exactly", () => {
    const result = calculateFxSettlement({ foreignAmount: 500, actualRate: 1.2, benchmarkRate: 1.2 });
    expect(result.gainLoss).toBe(0);
  });

  it("returns a null benchmarkAmount and gainLoss when no benchmark rate is on file", () => {
    const result = calculateFxSettlement({ foreignAmount: 1000, actualRate: 1.1, benchmarkRate: null });
    expect(result.convertedAmount).toBe(1100);
    expect(result.benchmarkAmount).toBeNull();
    expect(result.gainLoss).toBeNull();
  });
});
