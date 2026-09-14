import { advanceDate, calculateRecurringInvoice } from "./recurring-invoice-schedule";

describe("advanceDate", () => {
  // Month-end clamping itself (the interesting, previously-buggy behavior) is exhaustively
  // covered by date-utils.spec.ts, which this delegates to for monthly/quarterly/yearly — these
  // just confirm each frequency maps to the right number of months (or 7 days for weekly).
  it("adds 7 days for weekly", () => {
    expect(advanceDate(new Date("2026-01-01T00:00:00.000Z"), "weekly").toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("adds 1 month for monthly", () => {
    expect(advanceDate(new Date("2026-01-15T00:00:00.000Z"), "monthly").toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("adds 3 months for quarterly", () => {
    expect(advanceDate(new Date("2026-01-15T00:00:00.000Z"), "quarterly").toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });

  it("adds 1 year for yearly", () => {
    expect(advanceDate(new Date("2026-01-15T00:00:00.000Z"), "yearly").toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps month-end instead of overflowing (regression guard — see date-utils.spec.ts for the full matrix)", () => {
    expect(advanceDate(new Date("2026-01-31T00:00:00.000Z"), "monthly").toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("calculateRecurringInvoice", () => {
  it("computes line totals, subtotal, tax, and total", () => {
    const result = calculateRecurringInvoice(
      [
        { description: "Retainer", quantity: 1, unitPrice: 1000 },
        { description: "Extra hours", quantity: 5, unitPrice: 40 },
      ],
      19,
    );

    expect(result.lines).toEqual([
      { description: "Retainer", quantity: 1, unitPrice: 1000, lineTotal: 1000 },
      { description: "Extra hours", quantity: 5, unitPrice: 40, lineTotal: 200 },
    ]);
    expect(result.subtotal).toBe(1200);
    expect(result.taxAmount).toBe(228);
    expect(result.total).toBe(1428);
  });

  it("handles zero tax", () => {
    const result = calculateRecurringInvoice([{ description: "Flat fee", quantity: 1, unitPrice: 99.99 }], 0);
    expect(result.subtotal).toBe(99.99);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(99.99);
  });
});
