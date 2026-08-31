import { buildXRechnungXml, type BuildXRechnungXmlInput } from "./e-invoice";

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

describe("buildXRechnungXml", () => {
  it("includes the mandatory EN16931/XRechnung header fields", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0");
    expect(xml).toContain("<cbc:ID>INV-2026-042</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-08-31</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2026-09-30</cbc:DueDate>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>");
  });

  it("omits DueDate entirely when null", () => {
    const xml = buildXRechnungXml(baseInput({ dueDate: null }));
    expect(xml).not.toContain("DueDate");
  });

  it("writes seller and buyer postal addresses with their own party's fields", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(xml).toContain("<cbc:StreetName>Musterstraße 12</cbc:StreetName>");
    expect(xml).toContain("<cbc:CityName>Berlin</cbc:CityName>");
    expect(xml).toContain("<cbc:PostalZone>10115</cbc:PostalZone>");
    expect(xml).toContain("<cbc:StreetName>Kundenweg 5</cbc:StreetName>");
    expect(xml).toContain("<cbc:CityName>Munich</cbc:CityName>");
    expect(xml).toContain("<cbc:RegistrationName>Cantero Bau GmbH</cbc:RegistrationName>");
    expect(xml).toContain("<cbc:RegistrationName>Bauherr Schmidt</cbc:RegistrationName>");
  });

  it("includes PartyTaxScheme for a party with a VAT ID and omits it for one without", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(xml).toContain("<cbc:CompanyID>DE123456789</cbc:CompanyID>");
    // Only the seller has a VAT ID in the fixture — exactly one PartyTaxScheme block should appear.
    expect(xml.match(/<cac:PartyTaxScheme>/g)?.length).toBe(1);
  });

  it("includes PaymentMeans with the seller's IBAN when set, omits it when null", () => {
    const withIban = buildXRechnungXml(baseInput());
    expect(withIban).toContain("<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>");
    expect(withIban).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");

    const withoutIban = buildXRechnungXml(baseInput({ seller: { ...baseInput().seller, iban: null } }));
    expect(withoutIban).not.toContain("PaymentMeans");
  });

  it("computes the tax rate from taxAmount/subtotal and rounds to 2 decimals", () => {
    const xml = buildXRechnungXml(baseInput({ subtotal: 4550, taxAmount: 864.5 }));
    expect(xml).toContain("<cbc:Percent>19</cbc:Percent>");
  });

  it("falls back to a 0% rate when subtotal is 0, without dividing by zero", () => {
    const xml = buildXRechnungXml(baseInput({ subtotal: 0, taxAmount: 0, total: 0, lines: [] }));
    expect(xml).toContain("<cbc:Percent>0</cbc:Percent>");
  });

  it("emits one InvoiceLine per line, with escaped item names and rounded amounts", () => {
    const xml = buildXRechnungXml(
      baseInput({
        lines: [
          { description: "Rebar & mesh <10mm>", quantity: 12, unitPrice: 3.333, lineTotal: 40 },
          { description: "Formwork", quantity: 5, unitPrice: 10, lineTotal: 50 },
        ],
      }),
    );
    expect(xml.match(/<cac:InvoiceLine>/g)?.length).toBe(2);
    expect(xml).toContain("Rebar &amp; mesh &lt;10mm&gt;");
    expect(xml).toContain("<cbc:PriceAmount currencyID=\"EUR\">3.33</cbc:PriceAmount>");
  });

  it("reports LegalMonetaryTotal using the invoice's own subtotal/tax/total figures", () => {
    const xml = buildXRechnungXml(baseInput());
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">4550</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">5414.5</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">5414.5</cbc:PayableAmount>');
  });
});
