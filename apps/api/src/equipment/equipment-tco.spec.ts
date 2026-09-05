import { calculateTotalCostOfOwnership } from "./equipment-tco";

describe("calculateTotalCostOfOwnership", () => {
  it("sums fuel, maintenance, and depreciation into a total and cost-per-hour", () => {
    const result = calculateTotalCostOfOwnership({ fuelCost: 3000, maintenanceCost: 2000, accumulatedDepreciation: 5000, hoursElapsed: 1000 });
    expect(result.totalCost).toBe(10000);
    expect(result.costPerHour).toBe(10);
    expect(result.fuelSharePercent).toBe(30);
    expect(result.maintenanceSharePercent).toBe(20);
    expect(result.depreciationSharePercent).toBe(50);
  });

  it("returns null cost-per-hour with no elapsed hours", () => {
    const result = calculateTotalCostOfOwnership({ fuelCost: 100, maintenanceCost: 0, accumulatedDepreciation: 0, hoursElapsed: 0 });
    expect(result.costPerHour).toBeNull();
  });

  it("returns null shares when total cost is zero", () => {
    const result = calculateTotalCostOfOwnership({ fuelCost: 0, maintenanceCost: 0, accumulatedDepreciation: 0, hoursElapsed: 100 });
    expect(result.fuelSharePercent).toBeNull();
    expect(result.totalCost).toBe(0);
  });
});
