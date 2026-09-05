import { calculateTax, findActiveRate } from "./tax-calc";

describe("findActiveRate()", () => {
  it("picks the rate whose window contains the given date", () => {
    const rates = [
      { ratePercent: 5, effectiveFrom: new Date("2024-01-01"), effectiveTo: new Date("2025-01-01") },
      { ratePercent: 6, effectiveFrom: new Date("2025-01-01"), effectiveTo: null },
    ];
    expect(findActiveRate(rates, new Date("2024-06-01"))?.ratePercent).toBe(5);
    expect(findActiveRate(rates, new Date("2025-06-01"))?.ratePercent).toBe(6);
  });

  it("returns null when no rate covers the date", () => {
    const rates = [{ ratePercent: 5, effectiveFrom: new Date("2025-01-01"), effectiveTo: null }];
    expect(findActiveRate(rates, new Date("2024-01-01"))).toBeNull();
  });

  it("treats a null effectiveTo as still current", () => {
    const rates = [{ ratePercent: 7, effectiveFrom: new Date("2020-01-01"), effectiveTo: null }];
    expect(findActiveRate(rates, new Date("2030-01-01"))?.ratePercent).toBe(7);
  });
});

describe("calculateTax()", () => {
  it("computes tax as subtotal times the active rate", () => {
    const result = calculateTax({ subtotal: 1000, rate: { ratePercent: 8, effectiveFrom: new Date(), effectiveTo: null }, isExempt: false });
    expect(result.taxAmount).toBe(80);
    expect(result.ratePercentApplied).toBe(8);
  });

  it("returns zero tax when the client is exempt, even with an active rate", () => {
    const result = calculateTax({ subtotal: 1000, rate: { ratePercent: 8, effectiveFrom: new Date(), effectiveTo: null }, isExempt: true });
    expect(result.taxAmount).toBe(0);
  });

  it("returns zero tax when there's no active rate for the date", () => {
    const result = calculateTax({ subtotal: 1000, rate: null, isExempt: false });
    expect(result.taxAmount).toBe(0);
  });
});
