import { computeCriticalPath, minSuccessorStart, type DependencyForCpm, type TaskForCpm } from "./critical-path";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("computeCriticalPath", () => {
  it("marks the longer of two parallel chains as critical and gives the shorter one slack", () => {
    const tasks: TaskForCpm[] = [
      { id: "A", startDate: day(0), dueDate: day(2) }, // duration 2
      { id: "B", startDate: day(2), dueDate: day(5) }, // duration 3, finishes at project end
      { id: "C", startDate: day(2), dueDate: day(3) }, // duration 1, finishes early — has slack
    ];
    const deps: DependencyForCpm[] = [
      { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
      { predecessorId: "A", successorId: "C", type: "finish_to_start", lagDays: 0 },
    ];

    const result = computeCriticalPath(tasks, deps);
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));

    expect(byId.A.critical).toBe(true);
    expect(byId.A.slackDays).toBe(0);
    expect(byId.B.critical).toBe(true);
    expect(byId.B.slackDays).toBe(0);
    expect(byId.C.critical).toBe(false);
    expect(byId.C.slackDays).toBe(2);
  });

  it("respects lag days when computing slack", () => {
    const tasks: TaskForCpm[] = [
      { id: "A", startDate: day(0), dueDate: day(2) },
      { id: "B", startDate: day(4), dueDate: day(6) }, // starts 2 days after A finishes, matching the lag exactly
    ];
    const deps: DependencyForCpm[] = [{ predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 2 }];

    const result = computeCriticalPath(tasks, deps);
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));

    expect(byId.A.slackDays).toBe(0);
    expect(byId.B.slackDays).toBe(0);
  });

  it("returns every task unconstrained (slack 0, critical) when there are no dependencies at all", () => {
    const tasks: TaskForCpm[] = [{ id: "A", startDate: day(0), dueDate: day(2) }];
    const result = computeCriticalPath(tasks, []);

    expect(result[0].critical).toBe(true);
    expect(result[0].slackDays).toBe(0);
  });
});

describe("minSuccessorStart", () => {
  it("computes finish-to-start: successor can't start before predecessor finishes plus lag", () => {
    const predecessor: TaskForCpm = { id: "A", startDate: day(0), dueDate: day(3) };
    const successor: TaskForCpm = { id: "B", startDate: day(1), dueDate: day(4) };

    const min = minSuccessorStart(predecessor, successor, "finish_to_start", 1);

    expect(min).toEqual(day(4)); // predecessor finishes day 3, +1 day lag
  });

  it("computes start-to-start: successor can't start before predecessor starts plus lag", () => {
    const predecessor: TaskForCpm = { id: "A", startDate: day(0), dueDate: day(5) };
    const successor: TaskForCpm = { id: "B", startDate: day(0), dueDate: day(2) };

    const min = minSuccessorStart(predecessor, successor, "start_to_start", 2);

    expect(min).toEqual(day(2));
  });
});
