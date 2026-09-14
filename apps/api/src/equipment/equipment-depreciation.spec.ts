import { calculateDepreciation } from "./equipment-depreciation";

describe("calculateDepreciation()", () => {
  it("straight-line: depreciates evenly and reaches half book value at half the useful life", () => {
    const result = calculateDepreciation({
      cost: 12000,
      purchaseDate: new Date("2024-01-01"),
      method: "straight_line",
      usefulLifeMonths: 24,
      salvageValue: 0,
      asOf: new Date("2025-01-01"),
    });
    expect(result.monthsElapsed).toBe(12);
    expect(result.accumulatedDepreciation).toBe(6000);
    expect(result.bookValue).toBe(6000);
  });

  it("straight-line: never depreciates past salvage value even well beyond useful life", () => {
    const result = calculateDepreciation({
      cost: 10000,
      purchaseDate: new Date("2020-01-01"),
      method: "straight_line",
      usefulLifeMonths: 12,
      salvageValue: 2000,
      asOf: new Date("2026-01-01"),
    });
    expect(result.bookValue).toBe(2000);
    expect(result.accumulatedDepreciation).toBe(8000);
  });

  it("counts elapsed months by UTC calendar date, not the server process's local timezone", () => {
    // Purchased Jan 1, evaluated two weeks later on Jan 15 — no full month has elapsed yet. On a
    // server running behind UTC, reading the dates back with local getFullYear()/getMonth() would
    // misclassify the Jan-1 purchase as December (local midnight minus the UTC offset rolls back
    // a day), making this look like 1 full month has elapsed instead of 0.
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const result = calculateDepreciation({
        cost: 12000,
        purchaseDate: new Date("2026-01-01T00:00:00.000Z"),
        method: "straight_line",
        usefulLifeMonths: 24,
        salvageValue: 0,
        asOf: new Date("2026-01-15T12:00:00.000Z"),
      });
      expect(result.monthsElapsed).toBe(0);
      expect(result.accumulatedDepreciation).toBe(0);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("straight-line: no depreciation on the purchase date itself", () => {
    const result = calculateDepreciation({
      cost: 10000,
      purchaseDate: new Date("2026-01-01"),
      method: "straight_line",
      usefulLifeMonths: 24,
      salvageValue: 0,
      asOf: new Date("2026-01-01"),
    });
    expect(result.monthsElapsed).toBe(0);
    expect(result.bookValue).toBe(10000);
  });

  it("declining-balance: book value shrinks faster early on than straight-line", () => {
    const declining = calculateDepreciation({
      cost: 10000,
      purchaseDate: new Date("2025-01-01"),
      method: "declining_balance",
      usefulLifeMonths: 24,
      salvageValue: 0,
      asOf: new Date("2025-02-01"),
    });
    const straight = calculateDepreciation({
      cost: 10000,
      purchaseDate: new Date("2025-01-01"),
      method: "straight_line",
      usefulLifeMonths: 24,
      salvageValue: 0,
      asOf: new Date("2025-02-01"),
    });
    expect(declining.accumulatedDepreciation).toBeGreaterThan(straight.accumulatedDepreciation);
  });

  it("declining-balance: never drops book value below salvage value", () => {
    const result = calculateDepreciation({
      cost: 10000,
      purchaseDate: new Date("2015-01-01"),
      method: "declining_balance",
      usefulLifeMonths: 12,
      salvageValue: 1500,
      asOf: new Date("2026-01-01"),
    });
    expect(result.bookValue).toBeGreaterThanOrEqual(1500);
  });
});
