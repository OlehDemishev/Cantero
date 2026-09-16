import { buildPeppolBisXml } from "./peppol";
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
      endpointScheme: "9930",
      endpointId: "DE123456789",
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

describe("buildPeppolBisXml", () => {
  it("uses the generic Peppol BIS Billing 3.0 CustomizationID and ProfileID, not XRechnung's", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(xml).toContain("urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0");
    expect(xml).toContain("<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>");
    expect(xml).not.toContain("xrechnung");
  });

  it("includes the mandatory header fields", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<cbc:ID>INV-2026-042</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-08-31</cbc:IssueDate>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
  });

  it("emits the seller's EndpointID with its scheme when set", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(xml).toContain('<cbc:EndpointID schemeID="9930">DE123456789</cbc:EndpointID>');
  });

  it("omits EndpointID entirely for a party with no Peppol registration", () => {
    const xml = buildPeppolBisXml(baseInput());
    // The buyer fixture has no endpointScheme/endpointId — only one EndpointID (the seller's) should appear.
    expect(xml.match(/<cbc:EndpointID/g)?.length).toBe(1);
  });

  it("omits EndpointID when only one of scheme/id is set", () => {
    const xml = buildPeppolBisXml(baseInput({ seller: { ...baseInput().seller, endpointId: null } }));
    expect(xml).not.toContain("EndpointID");
  });

  it("writes seller and buyer postal addresses with their own party's fields", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(xml).toContain("<cbc:StreetName>Musterstraße 12</cbc:StreetName>");
    expect(xml).toContain("<cbc:StreetName>Kundenweg 5</cbc:StreetName>");
  });

  it("includes PartyTaxScheme for a party with a VAT ID and omits it for one without", () => {
    const xml = buildPeppolBisXml(baseInput());
    expect(xml).toContain("<cbc:CompanyID>DE123456789</cbc:CompanyID>");
    expect(xml.match(/<cac:PartyTaxScheme>/g)?.length).toBe(1);
  });

  it("includes PaymentMeans with the seller's IBAN when set, omits it when null", () => {
    const withIban = buildPeppolBisXml(baseInput());
    expect(withIban).toContain("<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>");

    const withoutIban = buildPeppolBisXml(baseInput({ seller: { ...baseInput().seller, iban: null } }));
    expect(withoutIban).not.toContain("PaymentMeans");
  });

  it("computes the tax rate from taxAmount/subtotal and rounds to 2 decimals", () => {
    const xml = buildPeppolBisXml(baseInput({ subtotal: 4550, taxAmount: 864.5 }));
    expect(xml).toContain("<cbc:Percent>19</cbc:Percent>");
  });

  it("emits one InvoiceLine per line, with escaped item names", () => {
    const xml = buildPeppolBisXml(
      baseInput({
        lines: [
          { description: "Rebar & mesh <10mm>", quantity: 12, unitPrice: 3.333, lineTotal: 40 },
          { description: "Formwork", quantity: 5, unitPrice: 10, lineTotal: 50 },
        ],
      }),
    );
    expect(xml.match(/<cac:InvoiceLine>/g)?.length).toBe(2);
    expect(xml).toContain("Rebar &amp; mesh &lt;10mm&gt;");
  });
});
