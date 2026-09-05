import { classifyReceivingLine } from "./receiving-discrepancy";

describe("classifyReceivingLine", () => {
  it("detects nothing for an exact, undamaged receipt", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 10, thisPassDamaged: 0 }),
    ).toEqual([]);
  });

  it("flags damaged quantity automatically", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 10, thisPassDamaged: 2 }),
    ).toEqual([{ type: "damaged", quantity: 2 }]);
  });

  it("flags an over-ship automatically when cumulative received exceeds ordered", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 12, thisPassDamaged: 0 }),
    ).toEqual([{ type: "over_ship", quantity: 2 }]);
  });

  it("accounts for previously received quantity when detecting an over-ship", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 8, thisPassReceived: 4, thisPassDamaged: 0 }),
    ).toEqual([{ type: "over_ship", quantity: 2 }]);
  });

  it("does not flag a shortfall when shortfallType is omitted", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 6, thisPassDamaged: 0 }),
    ).toEqual([]);
  });

  it("flags a short-ship when explicitly classified as such", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 6, thisPassDamaged: 0, shortfallType: "short_ship" }),
    ).toEqual([{ type: "short_ship", quantity: 4 }]);
  });

  it("flags a backorder when explicitly classified as such", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 6, thisPassDamaged: 0, shortfallType: "backorder" }),
    ).toEqual([{ type: "backorder", quantity: 4 }]);
  });

  it("can report both damaged and over_ship on the same pass", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 13, thisPassDamaged: 3 }),
    ).toEqual([
      { type: "damaged", quantity: 3 },
      { type: "over_ship", quantity: 3 },
    ]);
  });

  it("rounds quantities to 2 decimals", () => {
    expect(
      classifyReceivingLine({ orderedQuantity: 10, previouslyReceived: 0, thisPassReceived: 10.005, thisPassDamaged: 0 }),
    ).toEqual([{ type: "over_ship", quantity: 0.01 }]);
  });
});
