import { bucketCostHistoryByMonth, type CostHistoryEntry } from "./cost-history-bucket";

const NOW = new Date("2026-03-15T00:00:00Z");
const entry = (amount: number, iso: string, paid: boolean): CostHistoryEntry => ({ amount, incurredDate: new Date(iso), paid });

describe("bucketCostHistoryByMonth", () => {
  it("seeds every month in the window with zeros", () => {
    const result = bucketCostHistoryByMonth([], 3, NOW);
    expect(result).toEqual([
      { month: "2026-01", committed: 0, actual: 0, cumulativeActual: 0 },
      { month: "2026-02", committed: 0, actual: 0, cumulativeActual: 0 },
      { month: "2026-03", committed: 0, actual: 0, cumulativeActual: 0 },
    ]);
  });

  it("splits paid entries into actual and unpaid entries into committed, per month", () => {
    const entries = [entry(1000, "2026-02-05T00:00:00Z", true), entry(500, "2026-02-10T00:00:00Z", false)];
    const result = bucketCostHistoryByMonth(entries, 3, NOW);
    const feb = result.find((b) => b.month === "2026-02")!;
    expect(feb.actual).toBe(1000);
    expect(feb.committed).toBe(500);
  });

  it("accumulates actual cost across months rather than resetting each month", () => {
    const entries = [entry(1000, "2026-01-05T00:00:00Z", true), entry(500, "2026-02-05T00:00:00Z", true)];
    const result = bucketCostHistoryByMonth(entries, 3, NOW);
    expect(result.map((b) => b.cumulativeActual)).toEqual([1000, 1500, 1500]);
  });

  it("drops entries outside the requested window", () => {
    const entries = [entry(1000, "2024-01-01T00:00:00Z", true)];
    const result = bucketCostHistoryByMonth(entries, 3, NOW);
    expect(result.every((b) => b.actual === 0)).toBe(true);
  });
});
