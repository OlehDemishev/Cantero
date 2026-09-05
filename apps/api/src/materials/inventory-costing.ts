export interface CostLayerForConsumption {
  id: string;
  remainingQuantity: number;
  unitCost: number;
}
export interface FifoConsumptionResult {
  /** Total cost of the quantity actually consumed (excludes any shortfall). */
  totalCost: number;
  /** Quantity actually consumed from available layers — may be less than requested if layers run out. */
  consumedQuantity: number;
  /** Requested quantity that no layer was left to cover — issuing more than the tracked FIFO history holds. */
  shortfallQuantity: number;
  /** Each layer touched, with its new remainingQuantity (0 means fully consumed — caller deletes it). */
  updatedLayers: { id: string; remainingQuantity: number }[];
}

const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

/**
 * Blends a new costed receipt into a running weighted-average unit cost — the standard
 * moving-average inventory valuation formula. A non-positive quantityAfter (the receipt is the
 * first stock ever, or prior on-hand was already at/below zero from an over-issue) resets the
 * average to the receipt's own cost rather than producing a division-by-zero or negative average.
 */
export function calculateWeightedAverageCost(
  currentQuantity: number,
  currentAverageCost: number | null,
  receiptQuantity: number,
  receiptUnitCost: number,
): number {
  const priorValue = currentQuantity > 0 ? currentQuantity * (currentAverageCost ?? 0) : 0;
  const quantityAfter = Math.max(currentQuantity, 0) + receiptQuantity;
  if (quantityAfter <= 0) return receiptUnitCost;
  return round4((priorValue + receiptQuantity * receiptUnitCost) / quantityAfter);
}

/**
 * Consumes cost layers oldest-first (the `layers` array is expected pre-sorted by receivedAt
 * ascending) until `consumeQuantity` is satisfied or layers run out. A shortfall (issuing more
 * than the tracked FIFO history covers — e.g. stock received before costing was ever turned on)
 * is reported rather than thrown: the caller still records the movement, just with a smaller
 * costed quantity than the physical quantity, since refusing the issue over a costing gap would
 * block real warehouse work over a bookkeeping limitation.
 */
export function calculateFifoConsumption(layers: CostLayerForConsumption[], consumeQuantity: number): FifoConsumptionResult {
  let remaining = consumeQuantity;
  let totalCost = 0;
  const updatedLayers: { id: string; remainingQuantity: number }[] = [];

  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(layer.remainingQuantity, remaining);
    if (take <= 0) continue;
    totalCost += take * layer.unitCost;
    remaining -= take;
    updatedLayers.push({ id: layer.id, remainingQuantity: round4(layer.remainingQuantity - take) });
  }

  return {
    totalCost: round4(totalCost),
    consumedQuantity: round4(consumeQuantity - remaining),
    shortfallQuantity: round4(Math.max(remaining, 0)),
    updatedLayers,
  };
}
