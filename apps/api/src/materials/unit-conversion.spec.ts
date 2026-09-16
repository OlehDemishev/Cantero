import { convertUnitQuantity, UnitConversionError } from "./unit-conversion";

const EACH = { id: "ea", baseUnitId: null, factorToBase: null };
const BOX_OF_12 = { id: "box12", baseUnitId: "ea", factorToBase: 12 };
const PALLET_OF_10_BOXES = { id: "pallet", baseUnitId: "ea", factorToBase: 120 };
const METER = { id: "m", baseUnitId: null, factorToBase: null };

describe("convertUnitQuantity", () => {
  it("returns the same quantity when converting a unit to itself", () => {
    expect(convertUnitQuantity(5, EACH, EACH)).toBe(5);
    expect(convertUnitQuantity(5, BOX_OF_12, BOX_OF_12)).toBe(5);
  });

  it("converts a derived unit down to its base", () => {
    expect(convertUnitQuantity(3, BOX_OF_12, EACH)).toBe(36);
  });

  it("converts a base unit up to a derived unit", () => {
    expect(convertUnitQuantity(36, EACH, BOX_OF_12)).toBe(3);
  });

  it("converts between two derived units sharing the same base", () => {
    // 1 pallet (120 ea) = 10 boxes of 12
    expect(convertUnitQuantity(1, PALLET_OF_10_BOXES, BOX_OF_12)).toBe(10);
  });

  it("throws when the two units don't share a common base", () => {
    expect(() => convertUnitQuantity(5, BOX_OF_12, METER)).toThrow(UnitConversionError);
  });

  it("rounds to 6 decimal places to avoid floating-point noise", () => {
    const THIRD = { id: "third", baseUnitId: "ea", factorToBase: 1 / 3 };
    const result = convertUnitQuantity(1, THIRD, EACH);
    expect(result).toBeCloseTo(0.333333, 6);
  });
});
