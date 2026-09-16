import { round2 } from "./progress-billing";
import type { BuildXRechnungXmlInput, EInvoiceLine, EInvoiceParty } from "./e-invoice";

/**
 * Builds a UBL 2.1 Invoice document conforming to Peppol BIS Billing 3.0 — the international
 * e-invoicing network's profile. XRechnung (buildXRechnungXml in ./e-invoice.ts) is actually a
 * German CIUS/subset of this same standard, so the UBL skeleton here is nearly identical; the
 * three real differences are the CustomizationID/ProfileID values and the EndpointID (Peppol
 * Participant ID) on each party, which XRechnung doesn't require. Same hand-built, honest-subset
 * philosophy as the other three e-invoice/export formats in this codebase: structurally correct
 * against the real BIS Billing 3.0 model, not run through the official Peppol validator — a
 * single derived overall tax rate, no per-line ClassifiedTaxCategory.
 */

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function partyBlock(tag: "cac:AccountingSupplierParty" | "cac:AccountingCustomerParty", party: EInvoiceParty): string {
  const endpointId =
    party.endpointScheme && party.endpointId
      ? `    <cbc:EndpointID schemeID="${escapeXml(party.endpointScheme)}">${escapeXml(party.endpointId)}</cbc:EndpointID>\n`
      : "";
  return `  <${tag}>
    <cac:Party>
${endpointId}      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(party.street)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(party.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(party.postalCode)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${escapeXml(party.countryCode)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${
        party.vatId
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(party.vatId)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ""
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(party.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </${tag}>`;
}

function lineBlock(line: EInvoiceLine, index: number, currency: string): string {
  return `  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${round2(line.lineTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(line.description)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${round2(line.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

export function buildPeppolBisXml(input: BuildXRechnungXmlInput): string {
  const taxPercent = input.subtotal > 0 ? round2((input.taxAmount / input.subtotal) * 100) : 0;

  const lines = input.lines.map((line, i) => lineBlock(line, i, input.currency)).join("\n");

  const paymentMeans = input.seller.iban
    ? `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${escapeXml(input.seller.iban)}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${isoDate(input.issueDate)}</cbc:IssueDate>
${input.dueDate ? `  <cbc:DueDate>${isoDate(input.dueDate)}</cbc:DueDate>\n` : ""}  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
${partyBlock("cac:AccountingSupplierParty", input.seller)}
${partyBlock("cac:AccountingCustomerParty", input.buyer)}
${paymentMeans}  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${round2(input.taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${input.currency}">${round2(input.subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${input.currency}">${round2(input.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${taxPercent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${round2(input.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${input.currency}">${round2(input.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${round2(input.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${round2(input.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
}
