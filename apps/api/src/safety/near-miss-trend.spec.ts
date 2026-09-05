import { buildMonthlyNearMissTrend, calculateNearMissRatio } from "./near-miss-trend";

describe("calculateNearMissRatio", () => {
  it("returns null when there are no recordable cases (undefined, not infinite)", () => {
    expect(calculateNearMissRatio(5, 0)).toBeNull();
  });

  it("computes the ratio of near-misses to recordable cases", () => {
    expect(calculateNearMissRatio(10, 2)).toBe(5);
  });

  it("returns 0 when there are recordable cases but no near-misses reported", () => {
    expect(calculateNearMissRatio(0, 3)).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    expect(calculateNearMissRatio(7, 3)).toBeCloseTo(2.33, 2);
  });
});

describe("buildMonthlyNearMissTrend", () => {
  const d = (month: number) => new Date(Date.UTC(2026, month, 15));

  it("returns all 12 months even with no incidents", () => {
    const result = buildMonthlyNearMissTrend([]);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ month: 1, nearMissCount: 0, recordableCount: 0 });
  });

  it("buckets near-misses and recordable cases into their occurrence month", () => {
    const result = buildMonthlyNearMissTrend([
      { occurredAt: d(0), isNearMiss: true, oshaRecordable: false },
      { occurredAt: d(0), isNearMiss: true, oshaRecordable: false },
      { occurredAt: d(2), isNearMiss: false, oshaRecordable: true },
    ]);
    expect(result[0]).toEqual({ month: 1, nearMissCount: 2, recordableCount: 0 });
    expect(result[2]).toEqual({ month: 3, nearMissCount: 0, recordableCount: 1 });
  });

  it("counts a case that is both near-miss-flagged and recordable in both buckets", () => {
    const result = buildMonthlyNearMissTrend([{ occurredAt: d(5), isNearMiss: true, oshaRecordable: true }]);
    expect(result[5]).toEqual({ month: 6, nearMissCount: 1, recordableCount: 1 });
  });
});
