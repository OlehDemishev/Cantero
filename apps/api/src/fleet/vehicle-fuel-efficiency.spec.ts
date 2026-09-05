import { calculateFuelEfficiency } from "./vehicle-fuel-efficiency";

describe("calculateFuelEfficiency", () => {
  it("computes total fuel, idle hours, and miles-per-unit from odometer deltas", () => {
    const result = calculateFuelEfficiency([
      { quantity: 20, odometerMiles: 1000, idleHours: 1.5 },
      { quantity: 20, odometerMiles: 1400, idleHours: 2 },
    ]);
    expect(result.totalQuantity).toBe(40);
    expect(result.totalIdleHours).toBe(3.5);
    expect(result.milesPerUnit).toBe(10);
  });

  it("returns null milesPerUnit with fewer than two odometer readings", () => {
    const result = calculateFuelEfficiency([{ quantity: 20, odometerMiles: null, idleHours: null }]);
    expect(result.milesPerUnit).toBeNull();
    expect(result.totalIdleHours).toBe(0);
  });

  it("returns null milesPerUnit when total quantity is zero", () => {
    const result = calculateFuelEfficiency([
      { quantity: 0, odometerMiles: 1000, idleHours: null },
      { quantity: 0, odometerMiles: 1400, idleHours: null },
    ]);
    expect(result.milesPerUnit).toBeNull();
  });
});
