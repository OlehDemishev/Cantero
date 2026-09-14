import { addMonthsUtc } from "./date-utils";

describe("addMonthsUtc", () => {
  it("adds a plain month with no overflow risk", () => {
    expect(addMonthsUtc(new Date("2026-01-15T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("adds an arbitrary number of months (quarterly/yearly are just this with 3/12)", () => {
    expect(addMonthsUtc(new Date("2026-01-15T00:00:00.000Z"), 3).toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(addMonthsUtc(new Date("2026-01-15T00:00:00.000Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps to the last day of a shorter month instead of overflowing into the next one", () => {
    // Jan 31 + 1 month must land on Feb 28 (2026 isn't a leap year), not March 3 — JS Date's own
    // Feb-31-overflows-to-March behavior, which would silently shift a month-end date forward.
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clamps to Feb 29 in a leap year", () => {
    expect(addMonthsUtc(new Date("2028-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("clamps Feb 29 landing on a non-leap year (the +12-months case)", () => {
    expect(addMonthsUtc(new Date("2028-02-29T00:00:00.000Z"), 12).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("keeps a month-end anchor on every subsequent call, not just the first clamp", () => {
    const dates = [new Date("2026-01-31T00:00:00.000Z")];
    for (let i = 0; i < 6; i++) dates.push(addMonthsUtc(dates[dates.length - 1], 1));
    // Jan 31 → Feb 28 → Mar 28 → ... (stuck on the 28th forever) would be the bug: clamping only
    // the day-number once, instead of re-deriving "last day of the month" every call.
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-01-31T00:00:00.000Z",
      "2026-02-28T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
      "2026-04-30T00:00:00.000Z",
      "2026-05-31T00:00:00.000Z",
      "2026-06-30T00:00:00.000Z",
      "2026-07-31T00:00:00.000Z",
    ]);
  });

  it("a day-30 anchor (not month-end in 31-day January) still ends up month-end-anchored after Feb", () => {
    // February is the only month short enough to ever force this clamp, and clamping always
    // lands exactly on Feb's own last day — so there's no reachable case where clamping produces
    // a date that ISN'T that month's last day. The 30th here gets pulled down to Feb 28, and from
    // that point on it's indistinguishable from a "real" month-end anchor: Mar 31, not Mar 28.
    const feb = addMonthsUtc(new Date("2026-01-30T00:00:00.000Z"), 1);
    expect(feb.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonthsUtc(feb, 1).toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("supports subtracting months (negative monthsToAdd)", () => {
    expect(addMonthsUtc(new Date("2026-03-15T00:00:00.000Z"), -1).toISOString()).toBe("2026-02-15T00:00:00.000Z");
    // Mar 31 - 1 month must clamp to Feb 28, not overflow backward past it.
    expect(addMonthsUtc(new Date("2026-03-31T00:00:00.000Z"), -1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
