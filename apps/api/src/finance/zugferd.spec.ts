import { buildZugferdCiiXml } from "./zugferd";
import type { BuildXRechnungXmlInput } from "./e-invoice";

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

describe("buildZugferdCiiXml", () => {
  it("includes the mandatory EN16931 CII header fields", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100");
    expect(xml).toContain("urn:cen.eu:en16931:2017");
    expect(xml).toContain("<ram:ID>INV-2026-042</ram:ID>");
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toContain('<udt:DateTimeString format="102">20260831</udt:DateTimeString>');
    expect(xml).toContain("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>");
  });

  it("omits the due-date payment terms block entirely when dueDate is null", () => {
    const xml = buildZugferdCiiXml(baseInput({ dueDate: null }));
    expect(xml).not.toContain("DueDateDateTime");
    expect(xml).not.toContain("SpecifiedTradePaymentTerms");
  });

  it("writes seller and buyer postal addresses with their own party's fields", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(xml).toContain("<ram:LineOne>Musterstraße 12</ram:LineOne>");
    expect(xml).toContain("<ram:CityName>Berlin</ram:CityName>");
    expect(xml).toContain("<ram:PostcodeCode>10115</ram:PostcodeCode>");
    expect(xml).toContain("<ram:LineOne>Kundenweg 5</ram:LineOne>");
    expect(xml).toContain("<ram:CityName>Munich</ram:CityName>");
    expect(xml.match(/<ram:Name>Cantero Bau GmbH<\/ram:Name>/g)?.length).toBe(1);
    expect(xml.match(/<ram:Name>Bauherr Schmidt<\/ram:Name>/g)?.length).toBe(1);
  });

  it("includes SpecifiedTaxRegistration for a party with a VAT ID and omits it for one without", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(xml).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>');
    expect(xml.match(/<ram:SpecifiedTaxRegistration>/g)?.length).toBe(1);
  });

  it("includes payment means with the seller's IBAN when set, omits it when null", () => {
    const withIban = buildZugferdCiiXml(baseInput());
    expect(withIban).toContain("<ram:TypeCode>58</ram:TypeCode>");
    expect(withIban).toContain("<ram:IBANID>DE89370400440532013000</ram:IBANID>");

    const withoutIban = buildZugferdCiiXml(baseInput({ seller: { ...baseInput().seller, iban: null } }));
    expect(withoutIban).not.toContain("SpecifiedTradeSettlementPaymentMeans");
  });

  it("computes the tax rate from taxAmount/subtotal and rounds to 2 decimals", () => {
    const xml = buildZugferdCiiXml(baseInput({ subtotal: 4550, taxAmount: 864.5 }));
    expect(xml).toContain("<ram:RateApplicablePercent>19</ram:RateApplicablePercent>");
  });

  it("falls back to a 0% rate when subtotal is 0, without dividing by zero", () => {
    const xml = buildZugferdCiiXml(baseInput({ subtotal: 0, taxAmount: 0, total: 0, lines: [] }));
    expect(xml).toContain("<ram:RateApplicablePercent>0</ram:RateApplicablePercent>");
  });

  it("emits one line item per line, with escaped product names and rounded amounts", () => {
    const xml = buildZugferdCiiXml(
      baseInput({
        lines: [
          { description: "Rebar & mesh <10mm>", quantity: 12, unitPrice: 3.333, lineTotal: 40 },
          { description: "Formwork", quantity: 5, unitPrice: 10, lineTotal: 50 },
        ],
      }),
    );
    expect(xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g)?.length).toBe(2);
    expect(xml).toContain("Rebar &amp; mesh &lt;10mm&gt;");
    expect(xml).toContain("<ram:ChargeAmount>3.33</ram:ChargeAmount>");
  });

  it("reports the header monetary summation using the invoice's own subtotal/tax/total figures", () => {
    const xml = buildZugferdCiiXml(baseInput());
    expect(xml).toContain("<ram:TaxBasisTotalAmount>4550</ram:TaxBasisTotalAmount>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">864.5</ram:TaxTotalAmount>');
    expect(xml).toContain("<ram:GrandTotalAmount>5414.5</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:DuePayableAmount>5414.5</ram:DuePayableAmount>");
  });
});
