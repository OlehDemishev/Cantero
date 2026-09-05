import { calculateWarrantyRecovery } from "./warranty-recovery";

describe("calculateWarrantyRecovery", () => {
  it("counts only deducted backcharges as recovered", () => {
    const result = calculateWarrantyRecovery(1000, [
      { amount: 400, status: "deducted" },
      { amount: 300, status: "pending" },
      { amount: 200, status: "waived" },
    ]);
    expect(result.recoveredAmount).toBe(400);
    expect(result.pendingAmount).toBe(300);
    expect(result.recoveryPercent).toBe(40);
  });

  it("returns a null recoveryPercent when repairCost is null", () => {
    const result = calculateWarrantyRecovery(null, [{ amount: 400, status: "deducted" }]);
    expect(result.recoveryPercent).toBeNull();
    expect(result.recoveredAmount).toBe(400);
  });

  it("returns a null recoveryPercent when repairCost is zero", () => {
    const result = calculateWarrantyRecovery(0, [{ amount: 400, status: "deducted" }]);
    expect(result.recoveryPercent).toBeNull();
  });

  it("returns zeroed amounts with no backcharges at all", () => {
    const result = calculateWarrantyRecovery(1000, []);
    expect(result).toEqual({ recoveredAmount: 0, pendingAmount: 0, recoveryPercent: 0 });
  });

  it("can exceed 100% when recovered more than the repair cost", () => {
    const result = calculateWarrantyRecovery(500, [{ amount: 600, status: "deducted" }]);
    expect(result.recoveryPercent).toBe(120);
  });
});
