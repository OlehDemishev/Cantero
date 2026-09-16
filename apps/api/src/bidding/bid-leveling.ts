export interface BidLineForLeveling {
  description: string;
  amount: number;
  included: boolean;
  /** GAEB RNo, present only on DA84-imported lines — see BidRequestsService.importGaebDa84Bid. */
  positionNo?: string | null;
}
export interface BidForLeveling {
  bidId: string;
  lines: BidLineForLeveling[];
}
export interface LevelingScopeRow {
  /** As first seen across the bids — not normalized, so it reads naturally in the UI. */
  description: string;
  byBid: Record<string, { amount: number; included: boolean } | null>;
}

const normalize = (s: string): string => s.trim().toLowerCase();

/**
 * Aligns each bid's scope-item lines into a shared set of rows so a GC can see, side by side,
 * which subs included or excluded a given piece of scope — the classic "sub A included demo,
 * sub B didn't" comparison. When every bid's lines carry a GAEB positionNo (a DA84 import),
 * matching uses that exact position number — this is the whole reason GAEB beats free text for
 * leveling, since every bidder priced the identical, GC-issued scope item. Otherwise it falls
 * back to matching by description text (case/whitespace-insensitive), the original behavior for
 * free-text bids submitted via the subcontractor portal, where there's no shared scope taxonomy.
 * A row with a `null` entry for a bid means that bid never mentioned this scope item at all (as
 * opposed to `included: false`, which means the bid explicitly excluded it).
 */
export function calculateBidLeveling(bids: BidForLeveling[]): LevelingScopeRow[] {
  const usePositionNo = bids.length > 0 && bids.every((bid) => bid.lines.every((line) => !!line.positionNo));
  const keyOf = (line: BidLineForLeveling): string => (usePositionNo ? line.positionNo! : normalize(line.description));

  const firstSeenDescription = new Map<string, string>();
  for (const bid of bids) {
    for (const line of bid.lines) {
      const key = keyOf(line);
      if (!firstSeenDescription.has(key)) firstSeenDescription.set(key, line.description);
    }
  }

  return Array.from(firstSeenDescription.entries()).map(([key, description]) => {
    const byBid: LevelingScopeRow["byBid"] = {};
    for (const bid of bids) {
      const match = bid.lines.find((l) => keyOf(l) === key);
      byBid[bid.bidId] = match ? { amount: match.amount, included: match.included } : null;
    }
    return { description, byBid };
  });
}
