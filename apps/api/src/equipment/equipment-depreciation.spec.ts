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
