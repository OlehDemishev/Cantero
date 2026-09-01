import { weightedBidScore } from "./bid-scoring";

const CRITERIA = [
  { criterionId: "timeline", weight: 3 },
  { criterionId: "quality", weight: 5 },
  { criterionId: "safety", weight: 2 },
];

describe("weightedBidScore()", () => {
  it("returns null when nothing has been scored yet", () => {
    expect(weightedBidScore([], CRITERIA)).toBeNull();
  });

  it("computes a plain weighted average across all criteria when every one is scored", () => {
    // (5*3 + 3*5 + 4*2) / (3+5+2) = (15+15+8)/10 = 3.8
    const result = weightedBidScore(
      [
        { criterionId: "timeline", score: 5 },
        { criterionId: "quality", score: 3 },
        { criterionId: "safety", score: 4 },
      ],
      CRITERIA,
    );
    expect(result).toBe(3.8);
  });

  it("excludes an unscored criterion from both the numerator and the weight total", () => {
    // Only "quality" (weight 5) scored at 4 → 4*5/5 = 4, safety/timeline don't drag it down
    const result = weightedBidScore([{ criterionId: "quality", score: 4 }], CRITERIA);
    expect(result).toBe(4);
  });

  it("ignores a score for a criterion that no longer exists on the bid request", () => {
    const result = weightedBidScore([{ criterionId: "stale-criterion", score: 5 }], CRITERIA);
    expect(result).toBeNull();
  });

  it("returns exactly the single score when only one criterion exists", () => {
    const result = weightedBidScore([{ criterionId: "quality", score: 2 }], [{ criterionId: "quality", weight: 5 }]);
    expect(result).toBe(2);
  });
});
