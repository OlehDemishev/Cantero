import { calculateCureDeadline, isPastCureDeadline } from "./cure-deadline";

describe("calculateCureDeadline", () => {
  it("adds the cure period in days to the notice date", () => {
    const notice = new Date("2026-09-01T00:00:00.000Z");
    const deadline = calculateCureDeadline(notice, 10);
    expect(deadline?.toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("returns null when no cure period was granted", () => {
    expect(calculateCureDeadline(new Date("2026-09-01T00:00:00.000Z"), null)).toBeNull();
  });
});

describe("isPastCureDeadline", () => {
  it("is false before the deadline", () => {
    const deadline = new Date("2026-09-11T00:00:00.000Z");
    expect(isPastCureDeadline(deadline, new Date("2026-09-05T00:00:00.000Z"))).toBe(false);
  });

  it("is true after the deadline", () => {
    const deadline = new Date("2026-09-11T00:00:00.000Z");
    expect(isPastCureDeadline(deadline, new Date("2026-09-12T00:00:00.000Z"))).toBe(true);
  });

  it("is false when there is no deadline", () => {
    expect(isPastCureDeadline(null, new Date())).toBe(false);
  });
});
