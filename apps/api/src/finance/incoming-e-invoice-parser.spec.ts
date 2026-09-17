import { buildXRechnungXml, type BuildXRechnungXmlInput } from "./e-invoice";
import { buildZugferdCiiXml } from "./zugferd";
import { buildPeppolBisXml } from "./peppol";
import { detectXmlFormat, parseUblInvoice, parseCiiInvoice, parseEInvoiceXml, validateEn16931Core, type ParsedEInvoice } from "./incoming-e-invoice-parser";

function baseInput(overrides: Partial<BuildXRechnungXmlInput> = {}): BuildXRechnungXmlInput {
  return {
    invoiceNumber: "INV-2026-042",
    issueDate: new Date("2026-08-31T00:00:00.000Z"),
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    currency: "EUR",
    seller: {
      name: "Cantero Bau GmbH",
      street: "Musterstraße 12",
      city: "Berlin",
      postalCode: "10115",
      countryCode: "DE",
      vatId: "DE123456789",
      iban: "DE89370400440532013000",
    },
    buyer: {
      name: "Bauherr Schmidt",
      street: "Kundenweg 5",
      city: "Munich",
      postalCode: "80331",
      countryCode: "DE",
      vatId: null,
    },
    lines: [{ description: "Concrete slab, 100 m²", quantity: 100, unitPrice: 45.5, lineTotal: 4550 }],
    subtotal: 4550,
    taxAmount: 864.5,
    total: 5414.5,
    ...overrides,
  };
}

describe("detectXmlFormat — real output from this codebase's own outbound builders", () => {
  it("detects XRechnung UBL as xrechnung_ubl (not from a PDF)", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(detectXmlFormat(xml, false)).toBe("xrechnung_ubl");
  });

  it("detects Peppol BIS UBL as peppol_ubl", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(detectXmlFormat(xml, false)).toBe("peppol_ubl");
  });

  it("detects raw CII XML (not from a PDF) as xrechnung_cii", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(detectXmlFormat(xml, false)).toBe("xrechnung_cii");
  });

  it("detects the same CII XML as zugferd when it came from a PDF", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(detectXmlFormat(xml, true)).toBe("zugferd");
  });

  it("throws on something that isn't a recognizable e-invoice XML", () => {
    expect(() => detectXmlFormat("<html><body>not an invoice</body></html>", false)).toThrow(/recognizable/);
  });
});

describe("parseUblInvoice — real round-trip against buildXRechnungXml's own output", () => {
  it("recovers the header, both parties, and totals exactly", () => {
    const input = baseInput();
    const xml = buildXRechnungXml(input);

    const parsed = parseUblInvoice(xml);

    expect(parsed.invoiceNumber).toBe("INV-2026-042");
    expect(parsed.issueDate?.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(parsed.dueDate?.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.seller).toEqual({
      name: "Cantero Bau GmbH",
      street: "Musterstraße 12",
      city: "Berlin",
      postalCode: "10115",
      countryCode: "DE",
      vatId: "DE123456789",
      iban: "DE89370400440532013000",
      endpointScheme: null,
      endpointId: null,
    });
    expect(parsed.buyer).toEqual({
      name: "Bauherr Schmidt",
      street: "Kundenweg 5",
      city: "Munich",
      postalCode: "80331",
      countryCode: "DE",
      vatId: null,
      endpointScheme: null,
      endpointId: null,
    });
    expect(parsed.subtotal).toBe(4550);
    expect(parsed.taxAmount).toBe(864.5);
    expect(parsed.total).toBe(5414.5);
  });

  it("recovers the single invoice line", () => {
    const xml = buildXRechnungXml(baseInput());
    const parsed = parseUblInvoice(xml);

    expect(parsed.lines).toEqual([{ description: "Concrete slab, 100 m²", quantity: 100, unitPrice: 45.5, lineTotal: 4550, taxRatePercent: null }]);
  });

  it("recovers multiple invoice lines as an array (fast-xml-parser's single-element gotcha)", () => {
    const input = baseInput({
      lines: [
        { description: "Concrete slab", quantity: 100, unitPrice: 45.5, lineTotal: 4550 },
        { description: "Rebar", quantity: 500, unitPrice: 2, lineTotal: 1000 },
      ],
      subtotal: 5550,
      taxAmount: 1054.5,
      total: 6604.5,
    });
    const xml = buildXRechnungXml(input);

    const parsed = parseUblInvoice(xml);

    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0].description).toBe("Concrete slab");
    expect(parsed.lines[1].description).toBe("Rebar");
  });

  it("recovers a null seller VAT id and no IBAN when the seller has neither", () => {
    const input = baseInput({ seller: { ...baseInput().seller, vatId: null, iban: null } });
    const xml = buildXRechnungXml(input);

    const parsed = parseUblInvoice(xml);

    expect(parsed.seller?.vatId).toBeNull();
    expect(parsed.seller?.iban).toBeNull();
  });

  it("recovers a null due date when the invoice has none", () => {
    const xml = buildXRechnungXml(baseInput({ dueDate: null }));
    const parsed = parseUblInvoice(xml);
    expect(parsed.dueDate).toBeNull();
  });
});

describe("parseUblInvoice — Peppol's EndpointID, which XRechnung doesn't emit", () => {
  it("recovers the seller's Peppol Participant ID from buildPeppolBisXml's output", () => {
    const input = baseInput({ seller: { ...baseInput().seller, endpointScheme: "9930", endpointId: "DE123456789" } });
    const xml = buildPeppolBisXml(input);

    const parsed = parseUblInvoice(xml);

    expect(parsed.seller?.endpointScheme).toBe("9930");
    expect(parsed.seller?.endpointId).toBe("DE123456789");
  });

  it("leaves EndpointID null when the seller has none", () => {
    const xml = buildPeppolBisXml(baseInput());
    const parsed = parseUblInvoice(xml);
    expect(parsed.seller?.endpointScheme).toBeNull();
    expect(parsed.seller?.endpointId).toBeNull();
  });
});

describe("parseCiiInvoice — real round-trip against buildZugferdCiiXml's own output", () => {
  it("recovers the header, both parties, and totals exactly", () => {
    const input = baseInput();
    const xml = buildZugferdCiiXml(input);

    const parsed = parseCiiInvoice(xml);

    expect(parsed.invoiceNumber).toBe("INV-2026-042");
    expect(parsed.issueDate?.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.seller?.name).toBe("Cantero Bau GmbH");
    expect(parsed.seller?.vatId).toBe("DE123456789");
    expect(parsed.seller?.iban).toBe("DE89370400440532013000");
    expect(parsed.buyer?.name).toBe("Bauherr Schmidt");
    expect(parsed.subtotal).toBe(4550);
    expect(parsed.taxAmount).toBe(864.5);
    expect(parsed.total).toBe(5414.5);
  });

  it("recovers the due date from CII's YYYYMMDD date format", () => {
    const xml = buildZugferdCiiXml(baseInput());
    const parsed = parseCiiInvoice(xml);
    expect(parsed.dueDate?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("recovers the line item with its per-line tax rate (CII emits one, unlike UBL)", () => {
    const xml = buildZugferdCiiXml(baseInput());
    const parsed = parseCiiInvoice(xml);

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].description).toBe("Concrete slab, 100 m²");
    expect(parsed.lines[0].quantity).toBe(100);
    expect(parsed.lines[0].unitPrice).toBe(45.5);
    expect(parsed.lines[0].lineTotal).toBe(4550);
    expect(parsed.lines[0].taxRatePercent).toBeCloseTo(19, 5);
  });

  it("recovers multiple line items as an array", () => {
    const input = baseInput({
      lines: [
        { description: "Concrete slab", quantity: 100, unitPrice: 45.5, lineTotal: 4550 },
        { description: "Rebar", quantity: 500, unitPrice: 2, lineTotal: 1000 },
      ],
      subtotal: 5550,
      taxAmount: 1054.5,
      total: 6604.5,
    });
    const xml = buildZugferdCiiXml(input);

    const parsed = parseCiiInvoice(xml);

    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines.map((l) => l.description)).toEqual(["Concrete slab", "Rebar"]);
  });
});

describe("parseEInvoiceXml — dispatches to the right parser by format", () => {
  it("routes xrechnung_ubl and peppol_ubl to the UBL parser", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(parseEInvoiceXml(xml, "xrechnung_ubl").invoiceNumber).toBe("INV-2026-042");
    expect(parseEInvoiceXml(buildPeppolBisXml(baseInput()), "peppol_ubl").invoiceNumber).toBe("INV-2026-042");
  });

  it("routes xrechnung_cii and zugferd to the CII parser", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(parseEInvoiceXml(xml, "xrechnung_cii").invoiceNumber).toBe("INV-2026-042");
    expect(parseEInvoiceXml(xml, "zugferd").invoiceNumber).toBe("INV-2026-042");
  });
});

describe("validateEn16931Core", () => {
  function validParsed(overrides: Partial<ParsedEInvoice> = {}): ParsedEInvoice {
    return {
      invoiceNumber: "INV-1",
      issueDate: new Date("2026-08-31"),
      dueDate: null,
      currency: "EUR",
      seller: { name: "Seller GmbH", street: "S", city: "C", postalCode: "1", countryCode: "DE", vatId: "DE123", iban: null },
      buyer: { name: "Buyer GmbH", street: "S", city: "C", postalCode: "1", countryCode: "DE", vatId: null },
      lines: [{ description: "Work", quantity: 1, unitPrice: 100, lineTotal: 100, taxRatePercent: 19 }],
      subtotal: 100,
      taxAmount: 19,
      total: 119,
      ...overrides,
    };
  }

  it("reports no errors for an internally-consistent, complete invoice", () => {
    expect(validateEn16931Core(validParsed())).toEqual([]);
  });

  it("flags a missing invoice number (BR-1)", () => {
    expect(validateEn16931Core(validParsed({ invoiceNumber: null }))).toContain("BR-1: missing invoice number");
  });

  it("flags a missing issue date (BR-2)", () => {
    expect(validateEn16931Core(validParsed({ issueDate: null }))).toContain("BR-2: missing issue date");
  });

  it("flags an invoice with no line items (BR-16)", () => {
    expect(validateEn16931Core(validParsed({ lines: [] }))).toContain("BR-16: invoice has no line items");
  });

  it("flags a non-zero tax amount with no seller VAT id (BR-S-1)", () => {
    const parsed = validParsed({ seller: { ...validParsed().seller!, vatId: null } });
    expect(validateEn16931Core(parsed)).toContain("BR-S-1: seller VAT identifier is missing despite a non-zero tax amount");
  });

  it("does not flag BR-S-1 when tax is genuinely zero (reverse charge / exempt)", () => {
    const parsed = validParsed({ seller: { ...validParsed().seller!, vatId: null }, taxAmount: 0, total: 100 });
    expect(validateEn16931Core(parsed)).not.toContain(expect.stringContaining("BR-S-1"));
  });

  it("flags total not matching subtotal + tax (BR-CO-15)", () => {
    const parsed = validParsed({ total: 200 });
    expect(validateEn16931Core(parsed).some((e) => e.startsWith("BR-CO-15"))).toBe(true);
  });

  it("flags line totals not summing to the subtotal (BR-CO-10)", () => {
    const parsed = validParsed({ subtotal: 999 });
    expect(validateEn16931Core(parsed).some((e) => e.startsWith("BR-CO-10"))).toBe(true);
  });

  it("tolerates a tiny rounding difference (within ROUNDING_TOLERANCE) without flagging BR-CO-15", () => {
    // subtotal (100) + taxAmount (19) = 119 exactly; total is off by only 0.01.
    const parsed = validParsed({ total: 119.01 });
    const errors = validateEn16931Core(parsed);
    expect(errors.some((e) => e.startsWith("BR-CO-15"))).toBe(false);
  });
});
