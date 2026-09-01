import { calculatePayrollHours } from "./payroll-hours";

// Sunday 2026-08-30 is the start of the week containing 2026-08-31 (Monday) through 2026-09-05 (Saturday).
const MON = new Date("2026-08-31T08:00:00.000Z");
const TUE = new Date("2026-09-01T08:00:00.000Z");
const NEXT_MON = new Date("2026-09-07T08:00:00.000Z"); // following week

describe("calculatePayrollHours", () => {
  it("sums all of a worker's hours within one week as regular time when under the threshold", () => {
    const lines = calculatePayrollHours([
      { workerId: "w1", hours: 8, date: MON },
      { workerId: "w1", hours: 8, date: TUE },
    ]);
    expect(lines).toEqual([{ workerId: "w1", regularHours: 16, overtimeHours: 0 }]);
  });

  it("splits a single week's hours at the 40-hour threshold", () => {
    const lines = calculatePayrollHours([{ workerId: "w1", hours: 45, date: MON }]);
    expect(lines).toEqual([{ workerId: "w1", regularHours: 40, overtimeHours: 5 }]);
  });

  it("applies the 40-hour threshold per calendar week, not over the whole period", () => {
    // 45 hours in week 1, 35 hours in week 2 — 5 OT hours from week 1 only, not 0 (80 total < 80 threshold).
    const lines = calculatePayrollHours([
      { workerId: "w1", hours: 45, date: MON },
      { workerId: "w1", hours: 35, date: NEXT_MON },
    ]);
    expect(lines).toEqual([{ workerId: "w1", regularHours: 75, overtimeHours: 5 }]);
  });

  it("keeps each worker's hours independent", () => {
    const lines = calculatePayrollHours([
      { workerId: "w1", hours: 45, date: MON },
      { workerId: "w2", hours: 10, date: MON },
    ]);
    expect(lines).toEqual(
      expect.arrayContaining([
        { workerId: "w1", regularHours: 40, overtimeHours: 5 },
        { workerId: "w2", regularHours: 10, overtimeHours: 0 },
      ]),
    );
  });

  it("returns an empty array for no entries", () => {
    expect(calculatePayrollHours([])).toEqual([]);
  });

  it("rounds to 2 decimals", () => {
    const lines = calculatePayrollHours([
      { workerId: "w1", hours: 40.333, date: MON },
      { workerId: "w1", hours: 0.333, date: TUE },
    ]);
    expect(lines[0].regularHours).toBe(40);
    expect(lines[0].overtimeHours).toBe(0.67);
  });
});
