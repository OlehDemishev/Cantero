export interface StockLotForConsumption {
  id: string;
  remainingQuantity: number;
}

interface UpdatedLot {
  id: string;
  taken: number;
  remainingQuantity: number;
}

export interface LotConsumptionResult {
  /** Quantity actually consumed from available lots — may be less than requested if lots run out. */
  consumedQuantity: number;
  /** Requested quantity that no lot was left to cover. */
  shortfallQuantity: number;
  /** Each lot touched, with how much was taken from it and its new remainingQuantity — the caller
   * persists remainingQuantity onto StockLot and records `taken` as one StockLotMovement row. */
  updatedLots: { id: string; taken: number; remainingQuantity: number }[];
}

const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

/**
 * Consumes StockLot rows in the order given (the caller sorts — nearest-expiry-first with
 * no-expiry lots last, see sortLotsByExpiry) until `consumeQuantity` is satisfied or lots run
 * out. Mirrors calculateFifoConsumption's shape/semantics exactly (same shortfall-tolerant
 * behavior — a lot-tracked issue that outruns its tracked lot history still records the
 * movement, just against fewer tracked units than the physical quantity), but is a distinct
 * function because lot consumption orders by expiry, not receipt cost order, and a lot's
 * exhaustion doesn't imply anything about cost the way an InventoryCostLayer's does.
 */
export function consumeLotsByExpiry(lots: StockLotForConsumption[], consumeQuantity: number): LotConsumptionResult {
  let remaining = consumeQuantity;
  const updatedLots: UpdatedLot[] = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQuantity, remaining);
    if (take <= 0) continue;
    remaining -= take;
    updatedLots.push({ id: lot.id, taken: round4(take), remainingQuantity: round4(lot.remainingQuantity - take) });
  }

  return {
    consumedQuantity: round4(consumeQuantity - remaining),
    shortfallQuantity: round4(Math.max(remaining, 0)),
    updatedLots,
  };
}

/** FEFO ordering: nearest expiry first, lots with no expiry date last (they never "go bad"),
 * receivedAt ascending as a tiebreaker within each group — same tiebreak spirit as FIFO. */
export function sortLotsByExpiry<T extends { expiresAt: Date | null; receivedAt: Date }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiresAt === null && b.expiresAt === null) return a.receivedAt.getTime() - b.receivedAt.getTime();
    if (a.expiresAt === null) return 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt.getTime() - b.expiresAt.getTime() || a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}
