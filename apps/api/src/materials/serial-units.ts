export interface SerialUnitForConsumption {
  id: string;
}

export interface SerialConsumptionResult {
  /** The units selected, in the order given (already sorted oldest-registered-first by the caller). */
  consumedUnitIds: string[];
  /** How many units were requested but not available — 0 unless the tracked unit history has
   * fewer available units than the physical quantity being issued/written off. */
  shortfallQuantity: number;
}

/**
 * Picks exactly `quantity` units from `candidates` (already filtered to status=available at the
 * target warehouse+material, and sorted — the caller sorts oldest-registered-first, same "no
 * natural expiry-like ordering, so pick by registration order" reasoning FEFO uses expiry for).
 * Mirrors consumeLotsByExpiry's shortfall-tolerant shape: an issue that outruns the tracked unit
 * history still records the movement, just against fewer units than the physical quantity.
 * `quantity` must be a whole number — a unit is indivisible, so issuing 2.5 serialized units is a
 * validation error the caller must reject before calling this, not something this function
 * partially satisfies.
 */
export function selectUnitsForConsumption(candidates: SerialUnitForConsumption[], quantity: number): SerialConsumptionResult {
  if (!Number.isInteger(quantity)) {
    throw new RangeError("quantity must be a whole number — a serialized unit can't be partially consumed");
  }

  const consumedUnitIds = candidates.slice(0, quantity).map((c) => c.id);
  const shortfallQuantity = Math.max(quantity - consumedUnitIds.length, 0);
  return { consumedUnitIds, shortfallQuantity };
}
