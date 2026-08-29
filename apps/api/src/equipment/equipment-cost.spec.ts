import { calculateCostPerHour } from "./equipment-cost";

describe("calculateCostPerHour", () => {
  it("divides total cost by elapsed hours", () => {
    const result = calculateCostPerHour({ totalFuelCost: 500, totalMaintenanceCost: 300, hoursElapsed: 100 });
    expect(result.totalCost).toBe(800);
    expect(result.costPerHour).toBe(8);
  });

  it("returns null cost-per-hour (not Infinity/NaN) when no elapsed hours are measurable", () => {
    const result = calculateCostPerHour({ totalFuelCost: 500, totalMaintenanceCost: 0, hoursElapsed: 0 });
    expect(result.totalCost).toBe(500);
    expect(result.costPerHour).toBeNull();
  });

  it("sums fuel and maintenance cost together", () => {
    const result = calculateCostPerHour({ totalFuelCost: 120.5, totalMaintenanceCost: 79.5, hoursElapsed: 10 });
    expect(result.totalCost).toBe(200);
    expect(result.costPerHour).toBe(20);
  });
});
