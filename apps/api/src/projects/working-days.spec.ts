import { isWeekend, isWorkingDay, toDateKey } from "./working-days";

describe("isWeekend()", () => {
  it("flags Saturday and Sunday", () => {
    expect(isWeekend(new Date("2026-01-03T00:00:00Z"))).toBe(true); // Saturday
    expect(isWeekend(new Date("2026-01-04T00:00:00Z"))).toBe(true); // Sunday
  });

  it("does not flag a weekday", () => {
    expect(isWeekend(new Date("2026-01-05T00:00:00Z"))).toBe(false); // Monday
  });
});

describe("toDateKey()", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(toDateKey(new Date("2026-03-05T23:00:00Z"))).toBe("2026-03-05");
  });
});

describe("isWorkingDay()", () => {
  it("is false for a weekend even with no holidays configured", () => {
    expect(isWorkingDay(new Date("2026-01-03T00:00:00Z"), new Set())).toBe(false);
  });

  it("is false for a weekday that's a configured holiday", () => {
    expect(isWorkingDay(new Date("2026-01-05T00:00:00Z"), new Set(["2026-01-05"]))).toBe(false);
  });

  it("is true for an ordinary weekday", () => {
    expect(isWorkingDay(new Date("2026-01-05T00:00:00Z"), new Set(["2026-01-06"]))).toBe(true);
  });
});
