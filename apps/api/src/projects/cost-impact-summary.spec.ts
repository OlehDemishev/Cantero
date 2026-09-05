import { calculateCostImpactSummary } from "./cost-impact-summary";

describe("calculateCostImpactSummary", () => {
  it("excludes items with no estimate and no confirmed change order", () => {
    const result = calculateCostImpactSummary([{ type: "rfi", id: "r-1", label: "RFI-001", estimatedCostImpact: null, confirmedAmount: null }]);
    expect(result.rows).toEqual([]);
    expect(result.totalEstimated).toBe(0);
    expect(result.totalConfirmed).toBe(0);
  });

  it("counts an estimated-only item toward totalEstimated and unconfirmedCount, not totalConfirmed", () => {
    const result = calculateCostImpactSummary([{ type: "rfi", id: "r-1", label: "RFI-001", estimatedCostImpact: 500, confirmedAmount: null }]);
    expect(result.totalEstimated).toBe(500);
    expect(result.totalConfirmed).toBe(0);
    expect(result.unconfirmedCount).toBe(1);
    expect(result.rows[0].bestAmount).toBe(500);
  });

  it("prefers the confirmed amount over the estimate once a change order is linked", () => {
    const result = calculateCostImpactSummary([
      { type: "punch_list", id: "p-1", label: "Fix cracked slab", estimatedCostImpact: 500, confirmedAmount: 620 },
    ]);
    expect(result.totalEstimated).toBe(500);
    expect(result.totalConfirmed).toBe(620);
    expect(result.unconfirmedCount).toBe(0);
    expect(result.rows[0].bestAmount).toBe(620);
  });

  it("sums across a mix of RFI and punch-list items", () => {
    const result = calculateCostImpactSummary([
      { type: "rfi", id: "r-1", label: "RFI-001", estimatedCostImpact: 500, confirmedAmount: null },
      { type: "punch_list", id: "p-1", label: "Fix cracked slab", estimatedCostImpact: 300, confirmedAmount: 350 },
    ]);
    expect(result.totalEstimated).toBe(800);
    expect(result.totalConfirmed).toBe(350);
    expect(result.unconfirmedCount).toBe(1);
    expect(result.rows).toHaveLength(2);
  });
});
