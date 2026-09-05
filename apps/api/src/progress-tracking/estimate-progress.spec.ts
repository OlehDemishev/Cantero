import { estimateProgressFromPhotos } from "./estimate-progress";

describe("estimateProgressFromPhotos", () => {
  it("returns 0 with no matched keywords for photos with no matching tags", () => {
    const result = estimateProgressFromPhotos([{ tags: ["site visit", "misc"] }]);
    expect(result).toEqual({ estimatedPercentComplete: 0, matchedKeywords: [], photoCount: 1 });
  });

  it("matches a single phase keyword", () => {
    const result = estimateProgressFromPhotos([{ tags: ["framing"] }]);
    expect(result.estimatedPercentComplete).toBe(30);
    expect(result.matchedKeywords).toEqual(["framing"]);
  });

  it("matches a keyword as a substring of a longer tag", () => {
    const result = estimateProgressFromPhotos([{ tags: ["2nd floor framing complete"] }]);
    expect(result.matchedKeywords).toContain("complete");
    expect(result.estimatedPercentComplete).toBe(100);
  });

  it("picks the most-advanced phase across multiple photos, not an average", () => {
    const result = estimateProgressFromPhotos([{ tags: ["framing"] }, { tags: ["drywall"] }, { tags: ["foundation"] }]);
    expect(result.estimatedPercentComplete).toBe(60);
    expect(result.matchedKeywords).toEqual(["drywall"]);
  });

  it("is case-insensitive", () => {
    const result = estimateProgressFromPhotos([{ tags: ["FRAMING"] }]);
    expect(result.estimatedPercentComplete).toBe(30);
  });

  it("counts every photo passed in, matched or not", () => {
    const result = estimateProgressFromPhotos([{ tags: ["framing"] }, { tags: ["no match here"] }]);
    expect(result.photoCount).toBe(2);
  });
});
