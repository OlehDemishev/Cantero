import { calculatePriceChangePercent, isSignificantPriceChange, SIGNIFICANT_PRICE_CHANGE_THRESHOLD_PERCENT } from "./price-change";

describe("calculatePriceChangePercent", () => {
  it("computes a positive percent change for a price increase", () => {
    expect(calculatePriceChangePercent(100, 115)).toBe(15);
  });

  it("computes a negative percent change for a price decrease", () => {
    expect(calculatePriceChangePercent(100, 90)).toBe(-10);
  });

  it("returns 0 for no change", () => {
    expect(calculatePriceChangePercent(50, 50)).toBe(0);
  });

  it("returns 100 for a price moving away from zero, without dividing by zero", () => {
    expect(calculatePriceChangePercent(0, 25)).toBe(100);
  });

  it("returns 0 when both old and new price are zero", () => {
    expect(calculatePriceChangePercent(0, 0)).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    expect(calculatePriceChangePercent(3, 3.1)).toBeCloseTo(3.33, 2);
  });
});

describe("isSignificantPriceChange", () => {
  it("is significant right at the threshold", () => {
    expect(isSignificantPriceChange(SIGNIFICANT_PRICE_CHANGE_THRESHOLD_PERCENT)).toBe(true);
  });

  it("is significant for a large decrease too (uses the absolute value)", () => {
    expect(isSignificantPriceChange(-25)).toBe(true);
  });

  it("is not significant for a small tweak below the threshold", () => {
    expect(isSignificantPriceChange(2)).toBe(false);
  });
});
