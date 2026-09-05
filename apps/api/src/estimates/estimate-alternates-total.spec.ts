import { calculateAlternatesTotal } from "./estimate-alternates-total";

describe("calculateAlternatesTotal", () => {
  it("sums only accepted alternates, mixing adds and deducts", () => {
    const result = calculateAlternatesTotal([
      { status: "accepted", amount: 4200 },
      { status: "accepted", amount: -1800 },
      { status: "rejected", amount: 900 },
      { status: "pending", amount: 500 },
    ]);
    expect(result.acceptedCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(result.acceptedTotal).toBe(2400);
  });

  it("is zero with no accepted alternates", () => {
    const result = calculateAlternatesTotal([{ status: "pending", amount: 1000 }]);
    expect(result.acceptedTotal).toBe(0);
  });
});
