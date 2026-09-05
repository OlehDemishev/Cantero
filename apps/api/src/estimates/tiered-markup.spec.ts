import { calculateTieredMarkup } from "./tiered-markup";

describe("calculateTieredMarkup", () => {
  it("falls back to the flat percent for a cost type with no rule", () => {
    const result = calculateTieredMarkup(1000, 500, 10, []);
    expect(result).toBe(150); // (1000+500) * 10%
  });

  it("applies a materials-specific rule and falls back for labor", () => {
    const result = calculateTieredMarkup(1000, 500, 10, [{ costType: "materials", markupPercent: 20 }]);
    expect(result).toBe(250); // 1000*20% + 500*10%
  });

  it("applies separate rules for both materials and labor", () => {
    const result = calculateTieredMarkup(1000, 500, 10, [
      { costType: "materials", markupPercent: 20 },
      { costType: "labor", markupPercent: 5 },
    ]);
    expect(result).toBe(225); // 1000*20% + 500*5%
  });

  it("returns 0 when both cost totals are 0", () => {
    expect(calculateTieredMarkup(0, 0, 10, [])).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    const result = calculateTieredMarkup(333.33, 0, 10, []);
    expect(result).toBeCloseTo(33.33, 2);
  });
});
