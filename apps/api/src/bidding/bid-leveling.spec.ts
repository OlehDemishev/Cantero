import { calculateBidLeveling } from "./bid-leveling";

describe("calculateBidLeveling", () => {
  it("aligns matching scope items across bids by description", () => {
    const result = calculateBidLeveling([
      { bidId: "bid-a", lines: [{ description: "Demo", amount: 5000, included: true }] },
      { bidId: "bid-b", lines: [{ description: "demo", amount: 4500, included: true }] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].byBid["bid-a"]).toEqual({ amount: 5000, included: true });
    expect(result[0].byBid["bid-b"]).toEqual({ amount: 4500, included: true });
  });

  it("flags a scope item a bid never mentioned as null, distinct from explicitly excluded", () => {
    const result = calculateBidLeveling([
      { bidId: "bid-a", lines: [{ description: "Demo", amount: 5000, included: true }] },
      { bidId: "bid-b", lines: [{ description: "Demo", amount: 0, included: false }] },
      { bidId: "bid-c", lines: [] },
    ]);

    expect(result[0].byBid["bid-a"]).toEqual({ amount: 5000, included: true });
    expect(result[0].byBid["bid-b"]).toEqual({ amount: 0, included: false });
    expect(result[0].byBid["bid-c"]).toBeNull();
  });

  it("keeps distinct scope items as separate rows, using the first-seen casing", () => {
    const result = calculateBidLeveling([
      { bidId: "bid-a", lines: [{ description: "Site Cleanup", amount: 1000, included: true }] },
      { bidId: "bid-b", lines: [{ description: "Permits", amount: 2000, included: true }] },
    ]);

    expect(result.map((r) => r.description)).toEqual(["Site Cleanup", "Permits"]);
  });

  it("returns an empty result when no bid has any lines", () => {
    expect(calculateBidLeveling([{ bidId: "bid-a", lines: [] }])).toEqual([]);
  });
});
