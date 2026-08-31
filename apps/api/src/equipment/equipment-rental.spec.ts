import { calculateRentalRevenue } from "./equipment-rental";

describe("calculateRentalRevenue", () => {
  it("multiplies daily rate by whole days elapsed", () => {
    const result = calculateRentalRevenue({
      dailyRate: 100,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      asOf: new Date("2026-09-06T00:00:00.000Z"),
    });
    expect(result.daysElapsed).toBe(5);
    expect(result.revenue).toBe(500);
  });

  it("charges at least one day even when checked the same day it started", () => {
    const result = calculateRentalRevenue({
      dailyRate: 80,
      startDate: new Date("2026-09-01T09:00:00.000Z"),
      asOf: new Date("2026-09-01T14:00:00.000Z"),
    });
    expect(result.daysElapsed).toBe(1);
    expect(result.revenue).toBe(80);
  });

  it("rounds up a partial day into a full day's charge", () => {
    const result = calculateRentalRevenue({
      dailyRate: 50,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      asOf: new Date("2026-09-03T06:00:00.000Z"),
    });
    expect(result.daysElapsed).toBe(3);
    expect(result.revenue).toBe(150);
  });
});
