import { extractAmount, extractDate, extractVendor } from "./receipt-fields";

describe("extractAmount", () => {
  it("prefers the amount on the last line mentioning total", () => {
    const text = "Subtotal 10.00\nTax 1.50\nTotal 11.50";
    expect(extractAmount(text)).toBe(11.5);
  });

  it("parses European-style thousands/decimal separators", () => {
    const text = "Grand Total: 1.234,56";
    expect(extractAmount(text)).toBe(1234.56);
  });

  it("parses US-style thousands/decimal separators", () => {
    const text = "Amount Due: $1,234.56";
    expect(extractAmount(text)).toBe(1234.56);
  });

  it("falls back to the largest currency-shaped number when no total line exists", () => {
    const text = "Widget 5.00\nGadget 25.00\nGizmo 3.00";
    expect(extractAmount(text)).toBe(25);
  });

  it("returns null when no currency-shaped number is present", () => {
    expect(extractAmount("Thank you for your purchase")).toBeNull();
  });
});

describe("extractDate", () => {
  it("parses an ISO-style date", () => {
    expect(extractDate("Date: 2026-08-27")).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
  });

  it("parses a slash date with an unambiguous day component", () => {
    // 27 can't be a month, so this must be day/month/year regardless of locale.
    expect(extractDate("27/08/2026")).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
  });

  it("parses a month-name date", () => {
    expect(extractDate("Receipt date: Aug 27, 2026")).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
  });

  it("rejects an impossible calendar date", () => {
    expect(extractDate("Ref: 2026-13-40")).toBeNull();
  });

  it("returns null when no date pattern is found", () => {
    expect(extractDate("No date here")).toBeNull();
  });
});

describe("extractVendor", () => {
  it("returns the first substantive line near the top of the receipt", () => {
    const text = "ACME Hardware Supply\n123 Main St\nReceipt #4821\nDate: 2026-08-27";
    expect(extractVendor(text)).toBe("ACME Hardware Supply");
  });

  it("skips leading lines that are too short or numeric-only", () => {
    const text = "**\n42\nBuild Right Lumber Co\nTotal: 50.00";
    expect(extractVendor(text)).toBe("Build Right Lumber Co");
  });

  it("skips a line that starts with a receipt/invoice/date label", () => {
    const text = "Receipt #4821\nSteel & Supply Co\nTotal: 12.00";
    expect(extractVendor(text)).toBe("Steel & Supply Co");
  });

  it("returns null when nothing in the first few lines looks like a name", () => {
    expect(extractVendor("12\n34\n56")).toBeNull();
  });
});
