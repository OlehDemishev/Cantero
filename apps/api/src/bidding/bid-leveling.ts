export interface BidLineForLeveling {
  description: string;
  amount: number;
  included: boolean;
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
 * sub B didn't" comparison. Matching is by exact description text (case/whitespace-insensitive)
 * since there's no shared scope taxonomy; a row with a `null` entry for a bid means that bid
 * never mentioned this scope item at all (as opposed to `included: false`, which means the bid
 * explicitly excluded it).
 */
export function calculateBidLeveling(bids: BidForLeveling[]): LevelingScopeRow[] {
  const firstSeenDescription = new Map<string, string>();
  for (const bid of bids) {
    for (const line of bid.lines) {
      const key = normalize(line.description);
      if (!firstSeenDescription.has(key)) firstSeenDescription.set(key, line.description);
    }
  }

  return Array.from(firstSeenDescription.entries()).map(([key, description]) => {
    const byBid: LevelingScopeRow["byBid"] = {};
    for (const bid of bids) {
      const match = bid.lines.find((l) => normalize(l.description) === key);
      byBid[bid.bidId] = match ? { amount: match.amount, included: match.included } : null;
    }
    return { description, byBid };
  });
}
