import { calculateScheduleSlippage } from "./schedule-slippage";

describe("calculateScheduleSlippage", () => {
  it("reports positive slippage in days when the current due date moved later", () => {
    const result = calculateScheduleSlippage(
      [{ taskId: "t-1", name: "Framing", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-10") }],
      [{ id: "t-1", name: "Framing", status: "in_progress", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-15") }],
    );

    expect(result).toEqual([
      {
        taskId: "t-1",
        name: "Framing",
        status: "in_progress",
        baselineStartDate: new Date("2026-01-01"),
        baselineDueDate: new Date("2026-01-10"),
        currentStartDate: new Date("2026-01-01"),
        currentDueDate: new Date("2026-01-15"),
        slippageDays: 5,
      },
    ]);
  });

  it("reports negative slippage when the task finished ahead of baseline", () => {
    const result = calculateScheduleSlippage(
      [{ taskId: "t-1", name: "Framing", startDate: null, dueDate: new Date("2026-01-10") }],
      [{ id: "t-1", name: "Framing", status: "done", startDate: null, dueDate: new Date("2026-01-05") }],
    );
    expect(result[0].slippageDays).toBe(-5);
  });

  it("marks a baseline task with no matching current task as removed, with null current dates and slippage", () => {
    const result = calculateScheduleSlippage(
      [{ taskId: "t-gone", name: "Old scope", startDate: new Date("2026-01-01"), dueDate: new Date("2026-01-10") }],
      [],
    );

    expect(result).toEqual([
      {
        taskId: "t-gone",
        name: "Old scope",
        status: "removed",
        baselineStartDate: new Date("2026-01-01"),
        baselineDueDate: new Date("2026-01-10"),
        currentStartDate: null,
        currentDueDate: null,
        slippageDays: null,
      },
    ]);
  });

  it("leaves slippageDays null when either date is missing", () => {
    const result = calculateScheduleSlippage(
      [{ taskId: "t-1", name: "Framing", startDate: null, dueDate: null }],
      [{ id: "t-1", name: "Framing", status: "planned", startDate: null, dueDate: new Date("2026-01-15") }],
    );
    expect(result[0].slippageDays).toBeNull();
  });
});
