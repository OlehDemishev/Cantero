import { selectUnitsForConsumption } from "./serial-units";

describe("selectUnitsForConsumption", () => {
  it("selects the first N candidates in the order given", () => {
    const candidates = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    const result = selectUnitsForConsumption(candidates, 2);
    expect(result).toEqual({ consumedUnitIds: ["u1", "u2"], shortfallQuantity: 0 });
  });

  it("reports a shortfall when fewer units are available than requested", () => {
    const candidates = [{ id: "u1" }];
    const result = selectUnitsForConsumption(candidates, 3);
    expect(result).toEqual({ consumedUnitIds: ["u1"], shortfallQuantity: 2 });
  });

  it("returns nothing consumed with the full shortfall when no units are available", () => {
    const result = selectUnitsForConsumption([], 2);
    expect(result).toEqual({ consumedUnitIds: [], shortfallQuantity: 2 });
  });

  it("throws on a non-integer quantity", () => {
    expect(() => selectUnitsForConsumption([{ id: "u1" }], 1.5)).toThrow(RangeError);
  });
});
