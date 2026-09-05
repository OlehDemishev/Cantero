import { calculateFifoConsumption, calculateWeightedAverageCost } from "./inventory-costing";

describe("calculateWeightedAverageCost", () => {
  it("blends a receipt into an existing average", () => {
    // 10 units @ 5.00 on hand, receive 10 units @ 7.00 -> (50 + 70) / 20 = 6.00
    expect(calculateWeightedAverageCost(10, 5, 10, 7)).toBe(6);
  });

  it("uses the receipt's own cost as the average when there was no prior stock", () => {
    expect(calculateWeightedAverageCost(0, null, 10, 8)).toBe(8);
  });

  it("resets to the receipt's cost when current quantity is at or below zero", () => {
    expect(calculateWeightedAverageCost(-3, 5, 5, 9)).toBe(9);
  });

  it("treats a null currentAverageCost as zero value for the blend", () => {
    // 5 units with no recorded average (treated as 0 value) + 5 units @ 10 -> (0 + 50) / 10 = 5
    expect(calculateWeightedAverageCost(5, null, 5, 10)).toBe(5);
  });
});

describe("calculateFifoConsumption", () => {
  it("consumes the oldest layer first, then spills into the next", () => {
    const layers = [
      { id: "l1", remainingQuantity: 5, unitCost: 4 },
      { id: "l2", remainingQuantity: 10, unitCost: 6 },
    ];
    const result = calculateFifoConsumption(layers, 8);

    expect(result.totalCost).toBe(5 * 4 + 3 * 6);
    expect(result.consumedQuantity).toBe(8);
    expect(result.shortfallQuantity).toBe(0);
    expect(result.updatedLayers).toEqual([
      { id: "l1", remainingQuantity: 0 },
      { id: "l2", remainingQuantity: 7 },
    ]);
  });

  it("reports a shortfall when consuming more than all layers hold", () => {
    const layers = [{ id: "l1", remainingQuantity: 5, unitCost: 4 }];
    const result = calculateFifoConsumption(layers, 9);

    expect(result.consumedQuantity).toBe(5);
    expect(result.shortfallQuantity).toBe(4);
    expect(result.totalCost).toBe(20);
    expect(result.updatedLayers).toEqual([{ id: "l1", remainingQuantity: 0 }]);
  });

  it("reports a full shortfall and touches nothing when there are no layers at all", () => {
    const result = calculateFifoConsumption([], 3);
    expect(result.consumedQuantity).toBe(0);
    expect(result.shortfallQuantity).toBe(3);
    expect(result.totalCost).toBe(0);
    expect(result.updatedLayers).toEqual([]);
  });

  it("skips an already-empty layer without touching it", () => {
    const layers = [
      { id: "empty", remainingQuantity: 0, unitCost: 3 },
      { id: "l2", remainingQuantity: 4, unitCost: 5 },
    ];
    const result = calculateFifoConsumption(layers, 4);
    expect(result.updatedLayers).toEqual([{ id: "l2", remainingQuantity: 0 }]);
  });
});
