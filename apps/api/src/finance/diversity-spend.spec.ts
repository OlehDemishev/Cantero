import { calculateDiversitySpend } from "./diversity-spend";

describe("calculateDiversitySpend", () => {
  it("splits spend by category, counting a multi-certified sub toward each category", () => {
    const result = calculateDiversitySpend([
      { categories: ["mbe", "dbe"], amount: 10000 },
      { categories: ["wbe"], amount: 5000 },
      { categories: [], amount: 20000 },
    ]);
    expect(result.totalSpend).toBe(35000);
    expect(result.certifiedSpend).toBe(15000);
    expect(result.certifiedSharePercent).toBeCloseTo(42.86, 1);
    expect(result.byCategory).toEqual([
      { category: "dbe", spend: 10000 },
      { category: "mbe", spend: 10000 },
      { category: "wbe", spend: 5000 },
    ]);
  });

  it("returns null share and empty categories with no spend at all", () => {
    const result = calculateDiversitySpend([]);
    expect(result.certifiedSharePercent).toBeNull();
    expect(result.byCategory).toEqual([]);
  });

  it("is zero certified share when nothing is certified", () => {
    const result = calculateDiversitySpend([{ categories: [], amount: 1000 }]);
    expect(result.certifiedSharePercent).toBe(0);
  });
});
