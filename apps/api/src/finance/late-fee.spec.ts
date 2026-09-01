import { calculateLateFee, daysOverdue } from "./late-fee";

describe("calculateLateFee()", () => {
  it("computes a full month's fee for a balance 30 days overdue", () => {
    expect(calculateLateFee(1000, 30, 1.5)).toBe(15);
  });

  it("prorates for a partial month", () => {
    expect(calculateLateFee(1000, 15, 1.5)).toBe(7.5);
  });

  it("returns 0 when not yet overdue", () => {
    expect(calculateLateFee(1000, 0, 1.5)).toBe(0);
  });

  it("returns 0 when the balance is already settled", () => {
    expect(calculateLateFee(0, 30, 1.5)).toBe(0);
  });

  it("returns 0 when the company has no late-fee rate configured", () => {
    expect(calculateLateFee(1000, 30, 0)).toBe(0);
  });

  it("compounds linearly with days overdue rather than capping", () => {
    expect(calculateLateFee(1000, 60, 1.5)).toBe(30);
  });
});

describe("daysOverdue()", () => {
  it("returns 0 for a due date in the future", () => {
    expect(daysOverdue(new Date("2026-02-01"), new Date("2026-01-15"))).toBe(0);
  });

  it("returns whole days elapsed since the due date", () => {
    expect(daysOverdue(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-11T00:00:00Z"))).toBe(10);
  });
});
