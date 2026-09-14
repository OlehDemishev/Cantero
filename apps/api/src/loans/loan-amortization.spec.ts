import { calculateAmortizationSchedule } from "./loan-amortization";

describe("calculateAmortizationSchedule()", () => {
  it("produces one row per month of the term", () => {
    const rows = calculateAmortizationSchedule({
      principal: 12000,
      annualInterestRatePercent: 6,
      termMonths: 12,
      startDate: new Date("2026-01-01"),
    });
    expect(rows).toHaveLength(12);
  });

  it("pays down the balance to exactly zero — principal portions sum to the loan amount", () => {
    const rows = calculateAmortizationSchedule({
      principal: 12000,
      annualInterestRatePercent: 6,
      termMonths: 12,
      startDate: new Date("2026-01-01"),
    });
    const totalPrincipal = rows.reduce((sum, r) => sum + r.principalPortion, 0);
    expect(Math.round(totalPrincipal * 100) / 100).toBe(12000);
  });

  it("front-loads interest — the first row's interest exceeds the last row's", () => {
    const rows = calculateAmortizationSchedule({
      principal: 12000,
      annualInterestRatePercent: 6,
      termMonths: 12,
      startDate: new Date("2026-01-01"),
    });
    expect(rows[0].interestPortion).toBeGreaterThan(rows[11].interestPortion);
  });

  it("splits into equal principal-only installments at 0% interest", () => {
    const rows = calculateAmortizationSchedule({
      principal: 12000,
      annualInterestRatePercent: 0,
      termMonths: 12,
      startDate: new Date("2026-01-01"),
    });
    expect(rows.every((r) => r.interestPortion === 0)).toBe(true);
    expect(rows[0].principalPortion).toBe(1000);
  });

  it("schedules each row's due date one month after the previous", () => {
    const rows = calculateAmortizationSchedule({
      principal: 1000,
      annualInterestRatePercent: 5,
      termMonths: 3,
      startDate: new Date("2026-01-15"),
    });
    expect(rows[0].dueDate.getUTCMonth()).toBe(1);
    expect(rows[1].dueDate.getUTCMonth()).toBe(2);
    expect(rows[2].dueDate.getUTCMonth()).toBe(3);
  });

  it("clamps a month-end start date's due dates instead of overflowing into the next month", () => {
    // A loan originated Jan 31 must show its first payment due Feb 28, not Mar 3 (JS Date's own
    // overflow behavior for "add a month" on a day the target month doesn't have).
    const rows = calculateAmortizationSchedule({
      principal: 1000,
      annualInterestRatePercent: 5,
      termMonths: 2,
      startDate: new Date("2026-01-31"),
    });
    expect(rows[0].dueDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(rows[1].dueDate.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});
