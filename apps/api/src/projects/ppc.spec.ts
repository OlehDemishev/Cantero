import { calculatePpc } from "./ppc";

describe("calculatePpc", () => {
  it("computes PPC from resolved commitments only", () => {
    const result = calculatePpc([{ status: "completed" }, { status: "completed" }, { status: "missed" }, { status: "committed" }]);
    expect(result.committedCount).toBe(4);
    expect(result.completedCount).toBe(2);
    expect(result.missedCount).toBe(1);
    expect(result.openCount).toBe(1);
    expect(result.ppcPercent).toBeCloseTo(66.67, 1);
  });

  it("returns null PPC when nothing has been resolved yet", () => {
    const result = calculatePpc([{ status: "committed" }, { status: "committed" }]);
    expect(result.ppcPercent).toBeNull();
  });

  it("is 100 when everything resolved was completed", () => {
    const result = calculatePpc([{ status: "completed" }, { status: "completed" }]);
    expect(result.ppcPercent).toBe(100);
  });

  it("is 0 when everything resolved was missed", () => {
    const result = calculatePpc([{ status: "missed" }]);
    expect(result.ppcPercent).toBe(0);
  });
});
