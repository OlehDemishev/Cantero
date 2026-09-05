import { calculateWinRate } from "./win-rate";

describe("calculateWinRate", () => {
  it("computes win rate and totals across decided estimates only", () => {
    const result = calculateWinRate([
      { clientDecision: "approved", grandTotal: 10000, sentAt: null, decisionAt: null },
      { clientDecision: "approved", grandTotal: 20000, sentAt: null, decisionAt: null },
      { clientDecision: "rejected", grandTotal: 5000, sentAt: null, decisionAt: null },
      { clientDecision: "pending", grandTotal: 99999, sentAt: null, decisionAt: null },
      { clientDecision: "countered", grandTotal: 88888, sentAt: null, decisionAt: null },
    ]);
    expect(result.decidedCount).toBe(3);
    expect(result.wonCount).toBe(2);
    expect(result.lostCount).toBe(1);
    expect(result.winRatePercent).toBeCloseTo(66.67, 1);
    expect(result.wonValue).toBe(30000);
    expect(result.lostValue).toBe(5000);
  });

  it("returns null win rate when nothing has been decided", () => {
    const result = calculateWinRate([{ clientDecision: "pending", grandTotal: 1000, sentAt: null, decisionAt: null }]);
    expect(result.winRatePercent).toBeNull();
    expect(result.decidedCount).toBe(0);
  });

  it("computes average days to decision from sentAt/decisionAt pairs", () => {
    const result = calculateWinRate([
      { clientDecision: "approved", grandTotal: 1000, sentAt: new Date("2026-09-01T00:00:00Z"), decisionAt: new Date("2026-09-05T00:00:00Z") },
      { clientDecision: "rejected", grandTotal: 1000, sentAt: new Date("2026-09-01T00:00:00Z"), decisionAt: new Date("2026-09-03T00:00:00Z") },
    ]);
    expect(result.averageDaysToDecision).toBe(3);
  });

  it("returns null average days when timestamps are missing", () => {
    const result = calculateWinRate([{ clientDecision: "approved", grandTotal: 1000, sentAt: null, decisionAt: null }]);
    expect(result.averageDaysToDecision).toBeNull();
  });
});
