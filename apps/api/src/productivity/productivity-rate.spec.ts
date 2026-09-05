import { calculateProductivityRate } from "./productivity-rate";

describe("calculateProductivityRate", () => {
  it("computes hours-per-unit and units-per-hour across multiple logs", () => {
    const result = calculateProductivityRate([
      { quantityCompleted: 100, laborHours: 8 },
      { quantityCompleted: 50, laborHours: 4 },
    ]);
    expect(result.totalQuantityCompleted).toBe(150);
    expect(result.totalLaborHours).toBe(12);
    expect(result.hoursPerUnit).toBe(0.08);
    expect(result.unitsPerHour).toBe(12.5);
  });

  it("returns null rates when there are no entries", () => {
    const result = calculateProductivityRate([]);
    expect(result.hoursPerUnit).toBeNull();
    expect(result.unitsPerHour).toBeNull();
  });

  it("returns null hoursPerUnit when quantity completed is zero", () => {
    const result = calculateProductivityRate([{ quantityCompleted: 0, laborHours: 5 }]);
    expect(result.hoursPerUnit).toBeNull();
    expect(result.unitsPerHour).toBe(0);
  });
});
