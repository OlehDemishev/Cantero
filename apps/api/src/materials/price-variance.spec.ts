import { calculatePriceVariance } from "./price-variance";

describe("calculatePriceVariance", () => {
  it("returns a positive percentage when the supplier prices above catalog", () => {
    // paid 11 vs catalog 10 -> +10%
    expect(calculatePriceVariance([{ unitPrice: 11, quantity: 5, catalogPrice: 10 }])).toBe(10);
  });

  it("returns a negative percentage when the supplier prices below catalog", () => {
    expect(calculatePriceVariance([{ unitPrice: 9, quantity: 5, catalogPrice: 10 }])).toBe(-10);
  });

  it("weights the average by quantity, not by line count", () => {
    // 1 unit at +100% variance, 99 units at 0% variance -> should land near 0%, not 50%
    const result = calculatePriceVariance([
      { unitPrice: 20, quantity: 1, catalogPrice: 10 },
      { unitPrice: 10, quantity: 99, catalogPrice: 10 },
    ]);
    expect(result).toBe(1);
  });

  it("excludes lines with a zero catalog price rather than dividing by zero", () => {
    const result = calculatePriceVariance([
      { unitPrice: 5, quantity: 10, catalogPrice: 0 },
      { unitPrice: 11, quantity: 10, catalogPrice: 10 },
    ]);
    expect(result).toBe(10);
  });

  it("returns null when there are no priceable lines at all", () => {
    expect(calculatePriceVariance([])).toBeNull();
    expect(calculatePriceVariance([{ unitPrice: 5, quantity: 10, catalogPrice: 0 }])).toBeNull();
  });
});
