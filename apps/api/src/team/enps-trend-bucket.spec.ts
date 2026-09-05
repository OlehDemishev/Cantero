import { bucketEnpsTrendByMonth, type EnpsResponseRow } from "./enps-trend-bucket";

const NOW = new Date("2026-03-15T00:00:00Z");
const row = (score: number, iso: string): EnpsResponseRow => ({ score, respondedAt: new Date(iso) });

describe("bucketEnpsTrendByMonth", () => {
  it("seeds every month in the window even with no responses", () => {
    const result = bucketEnpsTrendByMonth([], 3, NOW);
    expect(result.map((b) => b.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(result.every((b) => b.enpsScore === null && b.responseCount === 0)).toBe(true);
  });

  it("computes the eNPS score per month from that month's responses only", () => {
    const responses = [
      row(10, "2026-02-01T00:00:00Z"), // promoter, Feb
      row(9, "2026-02-10T00:00:00Z"), // promoter, Feb
      row(3, "2026-02-15T00:00:00Z"), // detractor, Feb
      row(7, "2026-03-01T00:00:00Z"), // passive, Mar
    ];
    const result = bucketEnpsTrendByMonth(responses, 3, NOW);
    const feb = result.find((b) => b.month === "2026-02")!;
    const mar = result.find((b) => b.month === "2026-03")!;
    expect(feb).toEqual({ month: "2026-02", enpsScore: Math.round(((2 - 1) / 3) * 100), responseCount: 3 });
    expect(mar).toEqual({ month: "2026-03", enpsScore: 0, responseCount: 1 });
  });

  it("drops responses that fall outside the requested window", () => {
    const responses = [row(10, "2025-01-01T00:00:00Z")];
    const result = bucketEnpsTrendByMonth(responses, 3, NOW);
    expect(result.reduce((sum, b) => sum + b.responseCount, 0)).toBe(0);
  });

  it("never returns a raw per-respondent score or date, only the aggregate", () => {
    const result = bucketEnpsTrendByMonth([row(10, "2026-03-01T00:00:00Z")], 1, NOW);
    expect(Object.keys(result[0])).toEqual(["month", "enpsScore", "responseCount"]);
  });
});
