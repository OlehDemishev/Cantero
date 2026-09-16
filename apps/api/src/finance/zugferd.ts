import { round2 } from "./progress-billing";
import type { BuildXRechnungXmlInput, EInvoiceLine, EInvoiceParty } from "./e-invoice";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** CII dates use format="102" (YYYYMMDD), unlike UBL/XRechnung's ISO "YYYY-MM-DD". */
function ciiDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function partyBlock(tag: "ram:SellerTradeParty" | "ram:BuyerTradeParty", party: EInvoiceParty): string {
  return `      <${tag}>
        <ram:Name>${escapeXml(party.name)}</ram:Name>
        ${
          party.vatId
            ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(party.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
            : ""
        }
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(party.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(party.street)}</ram:LineOne>
          <ram:CityName>${escapeXml(party.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(party.countryCode)}</ram:CountryID>
        </ram:PostalTradeAddress>
      </${tag}>`;
}

function lineBlock(line: EInvoiceLine, index: number, taxPercent: number): string {
  return `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escapeXml(line.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${round2(line.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${line.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${taxPercent}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${round2(line.lineTotal)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
}

/**
 * Builds the UN/CEFACT Cross Industry Invoice (CII) XML that ZUGFeRD/Factur-X embeds inside a
 * PDF/A-3 (see PdfService.renderZugferdInvoice) — the format Factur-X software actually reads, as
 * opposed to XRechnung's UBL syntax (buildXRechnungXml in ./e-invoice.ts). Both ultimately carry
 * the same EN16931 business data (this function reuses BuildXRechnungXmlInput/EInvoiceParty/
 * EInvoiceLine unchanged), but the XML schema is genuinely different — CII is not "UBL with
 * different tag names," so this is a separate hand-built template, not a reuse of the UBL one.
 * Same honest-subset approach as buildXRechnungXml: structurally correct against the real EN16931
 * Comfort profile, not run through an official CII/Factur-X validator.
 */
export function buildZugferdCiiXml(input: BuildXRechnungXmlInput): string {
  const taxPercent = input.subtotal > 0 ? round2((input.taxAmount / input.subtotal) * 100) : 0;

  const lines = input.lines.map((line, i) => lineBlock(line, i, taxPercent)).join("\n");

  const paymentMeans = input.seller.iban
    ? `      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${escapeXml(input.seller.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>\n`
    : "";

  const dueDate = input.dueDate
    ? `      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${ciiDate(input.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(input.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${ciiDate(input.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
${partyBlock("ram:SellerTradeParty", input.seller)}
${partyBlock("ram:BuyerTradeParty", input.buyer)}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${input.currency}</ram:InvoiceCurrencyCode>
${paymentMeans}      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${round2(input.taxAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${round2(input.subtotal)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${taxPercent}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
${dueDate}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${round2(input.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${round2(input.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${input.currency}">${round2(input.taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${round2(input.total)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${round2(input.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
