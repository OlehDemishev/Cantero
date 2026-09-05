import { levelAssignments } from "./level-assignments";

const d = (s: string) => new Date(s);

describe("levelAssignments", () => {
  it("leaves non-overlapping assignments untouched", () => {
    const result = levelAssignments([
      { id: "a", startDate: d("2026-01-01"), endDate: d("2026-01-03") },
      { id: "b", startDate: d("2026-01-05"), endDate: d("2026-01-07") },
    ]);
    expect(result.every((r) => r.shiftedByDays === 0)).toBe(true);
  });

  it("pushes an overlapping assignment to start right after the previous one ends", () => {
    const result = levelAssignments([
      { id: "a", startDate: d("2026-01-01"), endDate: d("2026-01-05") },
      { id: "b", startDate: d("2026-01-03"), endDate: d("2026-01-06") },
    ]);
    const b = result.find((r) => r.id === "b")!;
    expect(b.startDate).toEqual(d("2026-01-05"));
    expect(b.shiftedByDays).toBe(2);
  });

  it("preserves each assignment's original duration when shifting it", () => {
    const result = levelAssignments([
      { id: "a", startDate: d("2026-01-01"), endDate: d("2026-01-05") },
      { id: "b", startDate: d("2026-01-02"), endDate: d("2026-01-04") },
    ]);
    const b = result.find((r) => r.id === "b")!;
    expect(b.endDate.getTime() - b.startDate.getTime()).toBe(d("2026-01-04").getTime() - d("2026-01-02").getTime());
  });

  it("cascades a shift through a chain of three overlapping assignments", () => {
    const result = levelAssignments([
      { id: "a", startDate: d("2026-01-01"), endDate: d("2026-01-04") },
      { id: "b", startDate: d("2026-01-02"), endDate: d("2026-01-05") },
      { id: "c", startDate: d("2026-01-03"), endDate: d("2026-01-06") },
    ]);
    const a = result.find((r) => r.id === "a")!;
    const b = result.find((r) => r.id === "b")!;
    const c = result.find((r) => r.id === "c")!;
    expect(a.shiftedByDays).toBe(0);
    expect(b.startDate).toEqual(a.endDate);
    expect(c.startDate).toEqual(b.endDate);
  });

  it("processes assignments in start-date order regardless of input order", () => {
    const result = levelAssignments([
      { id: "b", startDate: d("2026-01-03"), endDate: d("2026-01-06") },
      { id: "a", startDate: d("2026-01-01"), endDate: d("2026-01-05") },
    ]);
    expect(result.find((r) => r.id === "a")!.shiftedByDays).toBe(0);
    expect(result.find((r) => r.id === "b")!.shiftedByDays).toBe(2);
  });
});
