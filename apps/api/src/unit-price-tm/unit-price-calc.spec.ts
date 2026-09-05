import { calculateUnitPriceBilling } from "./unit-price-calc";

describe("calculateUnitPriceBilling", () => {
  it("sums measurements and bills against the contract unit price", () => {
    const result = calculateUnitPriceBilling([100, 50, 25], 12.5, null);
    expect(result.totalQuantityInstalled).toBe(175);
    expect(result.totalBilled).toBe(2187.5);
  });

  it("returns null variance when there is no estimated quantity", () => {
    const result = calculateUnitPriceBilling([100], 10, null);
    expect(result.varianceFromEstimate).toBeNull();
  });

  it("computes a positive variance when installed exceeds the estimate", () => {
    const result = calculateUnitPriceBilling([120], 10, 100);
    expect(result.varianceFromEstimate).toBe(20);
  });

  it("computes a negative variance when installed falls short of the estimate", () => {
    const result = calculateUnitPriceBilling([80], 10, 100);
    expect(result.varianceFromEstimate).toBe(-20);
  });

  it("returns zero totals for no measurements yet", () => {
    const result = calculateUnitPriceBilling([], 10, 50);
    expect(result.totalQuantityInstalled).toBe(0);
    expect(result.totalBilled).toBe(0);
    expect(result.varianceFromEstimate).toBe(-50);
  });
});
