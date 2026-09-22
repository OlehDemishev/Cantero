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

describe("receipts in German, Polish and Ukrainian", () => {
  it("reads a German Kassenbon: Summe, not the MwSt or Zwischensumme line; dotted date; umlaut vendor", () => {
    const text = [
      "Bäckerei Müller GmbH",
      "Hauptstraße 12, 10115 Berlin",
      "Datum: 27.08.2026 14:03",
      "Brötchen 2x0,45      0,90",
      "Kaffee               2,60",
      "Zwischensumme        3,50",
      "SUMME EUR            3,50",
      "MwSt 19% Betrag      0,56",
      "Gegeben Bar          5,00",
    ].join("\n");
    expect(extractAmount(text)).toBe(3.5);
    expect(extractDate(text)).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
    expect(extractVendor(text)).toBe("Bäckerei Müller GmbH");
  });

  it("reads a German invoice total with thousands separators and a two-digit year", () => {
    const text = "Baustoffhandel Krüger\nRechnung Nr. 4711 vom 03.09.26\nNetto 1.050,42\nUSt 19% 199,58\nGesamtbetrag 1.250,00 €";
    expect(extractAmount(text)).toBe(1250);
    expect(extractDate(text)).toBe(new Date(Date.UTC(2026, 8, 3)).toISOString());
    expect(extractVendor(text)).toBe("Baustoffhandel Krüger");
  });

  it("reads a Polish paragon: Suma PLN, PTU line ignored", () => {
    const text = "PARAGON FISKALNY\nBudmat Sp. z o.o.\n12.09.2026\nCement 25kg 3x21,99 65,97\nSprzed. opod. PTU A 65,97\nPTU A 23% 12,34\nSUMA PLN 65,97";
    expect(extractAmount(text)).toBe(65.97);
    expect(extractVendor(text)).toBe("Budmat Sp. z o.o.");
  });

  it("reads a Ukrainian receipt: Сума, Cyrillic vendor", () => {
    const text = "Епіцентр К\nЧЕК № 123\n05.10.2026\nЦвяхи 1кг 89,00\nСУМА 89,00 грн\nПДВ 20% 14,83";
    expect(extractAmount(text)).toBe(89);
    expect(extractDate(text)).toBe(new Date(Date.UTC(2026, 9, 5)).toISOString());
    expect(extractVendor(text)).toBe("Епіцентр К");
  });

  it("reads a German written-out month", () => {
    expect(extractDate("Lieferung am 5. März 2026")).toBe(new Date(Date.UTC(2026, 2, 5)).toISOString());
  });
});

