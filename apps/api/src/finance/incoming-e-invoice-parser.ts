import { XMLParser } from "fast-xml-parser";
import type { IncomingEInvoiceFormat } from "@prisma/client";
import type { EInvoiceParty, EInvoiceSeller } from "./e-invoice";

/**
 * Parses an incoming e-invoice — the reverse operation of buildXRechnungXml/buildZugferdCiiXml/
 * buildPeppolBisXml in this same finance module. German B2B companies have been legally required
 * to be *able to receive* e-invoices since 2025-01-01 — this module is what makes that possible,
 * and per the DACH-market priority order, is the highest-priority remaining gap: an outbound-only
 * e-invoicing story doesn't actually satisfy that obligation.
 *
 * Same "hand-built, honest subset" philosophy as the outbound builders (see their own doc
 * comments) — this parses the specific UBL/CII tag shapes THIS codebase's own builders produce
 * (which follow the conventional, near-universal `cac:`/`cbc:`/`ram:`/`rsm:`/`udt:` namespace
 * prefixes used across the XRechnung/Peppol/Factur-X ecosystem), not a generic namespace-URI-aware
 * XML processor. **A real-world sender using non-standard namespace prefix aliases for the same
 * underlying schema would fail to parse here** — a known, documented limitation, not silently
 * wrong output (validateEn16931Core() below still runs on whatever partial data comes out, so a
 * badly-mismatched document surfaces as validation errors rather than silently-wrong amounts).
 * EN 16931 has hundreds of Schematron business rules; validateEn16931Core() implements the
 * handful most likely to catch a genuinely broken or fraudulent invoice, not the full spec — this
 * is not a substitute for the official Kosit/EN16931 validator, same disclaimer as the outbound side.
 */

export interface ParsedEInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** EN 16931 allows a different tax rate per line — unlike this app's own outbound builders,
   * which only ever produce one flat header-level rate (see e-invoice.ts). Null when the source
   * document didn't specify one (rare, but tolerated rather than rejected). */
  taxRatePercent: number | null;
}

export interface ParsedEInvoice {
  invoiceNumber: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  currency: string | null;
  seller: EInvoiceSeller | null;
  buyer: EInvoiceParty | null;
  lines: ParsedEInvoiceLine[];
  subtotal: number | null;
  taxAmount: number | null;
  total: number | null;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });

/** fast-xml-parser only produces an array when an element repeats more than once in the source —
 * a document with exactly one invoice line would otherwise come back as a single object instead
 * of a one-element array, breaking any `.map()`/`.forEach()` over it. */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Almost every monetary/quantity element in real UBL/CII invoices carries an attribute alongside
 * its text content — `currencyID`, `unitCode`, a VAT scheme's `schemeID`, etc. (EN 16931 actually
 * requires most of these). With `ignoreAttributes: false`, fast-xml-parser then represents that
 * element as `{ "@_currencyID": "EUR", "#text": "4550" }` instead of a plain string — reading it
 * with `String(value)` on the *object* silently produces the useless string "[object Object]"
 * rather than throwing, so every such field must go through this helper instead. An element with
 * no attributes at all still comes through as a plain string/number and passes through unchanged.
 */
function textOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") {
    const text = (value as Record<string, unknown>)["#text"];
    return text != null ? String(text) : undefined;
  }
  return String(value);
}

function toNumber(value: unknown): number | null {
  const text = textOf(value);
  if (text === undefined || text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  const text = textOf(value);
  if (!text) return null;
  // CII uses YYYYMMDD (format="102"); UBL uses ISO YYYY-MM-DD. Normalize the former to the latter.
  const normalized = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Sniffs which of the four incoming formats an XML string is, without fully parsing it — cheap
 * enough to call before deciding which real parser to hand it to. Throws when neither a
 * recognizable UBL Invoice root nor a CII CrossIndustryInvoice root is found. */
export function detectXmlFormat(xml: string, cameFromPdf: boolean): IncomingEInvoiceFormat {
  if (/<(?:\w+:)?CrossIndustryInvoice[\s>]/.test(xml)) {
    // A PDF's embedded CII XML is called "zugferd" here regardless of the exact profile URN
    // inside it (Factur-X/ZUGFeRD's own profile identifiers vary by conformance level, and this
    // app doesn't need to distinguish them) — raw CII XML with no PDF wrapper is xrechnung_cii,
    // since that's the only CII-syntax e-invoice a company would plausibly receive as bare XML.
    return cameFromPdf ? "zugferd" : "xrechnung_cii";
  }
  if (/<(?:\w+:)?Invoice[\s>]/.test(xml)) {
    return /peppol/i.test(xml) ? "peppol_ubl" : "xrechnung_ubl";
  }
  throw new Error("Not a recognizable e-invoice XML — expected a UBL Invoice or CII CrossIndustryInvoice root element");
}

function parseUblParty(party: any): EInvoiceParty | null {
  if (!party) return null;
  const address = party["cac:PostalAddress"] ?? {};
  const taxScheme = party["cac:PartyTaxScheme"];
  const legalEntity = party["cac:PartyLegalEntity"] ?? {};
  const endpointId = party["cbc:EndpointID"];
  return {
    name: textOf(legalEntity["cbc:RegistrationName"]) ?? "",
    street: textOf(address["cbc:StreetName"]) ?? "",
    city: textOf(address["cbc:CityName"]) ?? "",
    postalCode: textOf(address["cbc:PostalZone"]) ?? "",
    countryCode: textOf(address["cac:Country"]?.["cbc:IdentificationCode"]) ?? "",
    vatId: textOf(taxScheme?.["cbc:CompanyID"]) ?? null,
    endpointScheme: typeof endpointId === "object" && endpointId ? String(endpointId["@_schemeID"] ?? "") || null : null,
    endpointId: textOf(endpointId) ?? null,
  };
}

/** Parses XRechnung-UBL or Peppol BIS XML (structurally the same UBL Invoice schema — see
 * buildXRechnungXml/buildPeppolBisXml's shared skeleton) into the common ParsedEInvoice shape. */
export function parseUblInvoice(xml: string): ParsedEInvoice {
  const doc = xmlParser.parse(xml);
  const invoice = doc.Invoice;
  if (!invoice) throw new Error("Missing UBL <Invoice> root element");

  const sellerParty = parseUblParty(invoice["cac:AccountingSupplierParty"]?.["cac:Party"]);
  const buyerParty = parseUblParty(invoice["cac:AccountingCustomerParty"]?.["cac:Party"]);
  const iban = invoice["cac:PaymentMeans"]?.["cac:PayeeFinancialAccount"]?.["cbc:ID"];

  const lines = toArray(invoice["cac:InvoiceLine"]).map(
    (line: any): ParsedEInvoiceLine => ({
      description: textOf(line["cac:Item"]?.["cbc:Name"]) ?? "",
      quantity: toNumber(line["cbc:InvoicedQuantity"]) ?? 0,
      unitPrice: toNumber(line["cac:Price"]?.["cbc:PriceAmount"]) ?? 0,
      lineTotal: toNumber(line["cbc:LineExtensionAmount"]) ?? 0,
      taxRatePercent: null, // buildXRechnungXml/buildPeppolBisXml don't emit per-line ClassifiedTaxCategory either
    }),
  );

  const legalTotal = invoice["cac:LegalMonetaryTotal"] ?? {};
  const taxTotal = invoice["cac:TaxTotal"];

  return {
    invoiceNumber: textOf(invoice["cbc:ID"]) ?? null,
    issueDate: toDate(invoice["cbc:IssueDate"]),
    dueDate: toDate(invoice["cbc:DueDate"]),
    currency: textOf(invoice["cbc:DocumentCurrencyCode"]) ?? null,
    seller: sellerParty ? { ...sellerParty, iban: textOf(iban) ?? null } : null,
    buyer: buyerParty,
    lines,
    subtotal: toNumber(legalTotal["cbc:TaxExclusiveAmount"]),
    taxAmount: toNumber(taxTotal?.["cbc:TaxAmount"]),
    total: toNumber(legalTotal["cbc:TaxInclusiveAmount"]),
  };
}

function parseCiiParty(party: any): EInvoiceParty | null {
  if (!party) return null;
  const address = party["ram:PostalTradeAddress"] ?? {};
  const taxRegistration = party["ram:SpecifiedTaxRegistration"];
  return {
    name: textOf(party["ram:Name"]) ?? "",
    street: textOf(address["ram:LineOne"]) ?? "",
    city: textOf(address["ram:CityName"]) ?? "",
    postalCode: textOf(address["ram:PostcodeCode"]) ?? "",
    countryCode: textOf(address["ram:CountryID"]) ?? "",
    vatId: textOf(taxRegistration?.["ram:ID"]) ?? null,
    endpointScheme: null, // CII/ZUGFeRD carries no Peppol Participant ID equivalent
    endpointId: null,
  };
}

/** Parses XRechnung-CII or ZUGFeRD/Factur-X CII XML (see buildZugferdCiiXml) into the common
 * ParsedEInvoice shape. For a ZUGFeRD hybrid PDF, extractZugferdXmlFromPdf() must be called first
 * to pull this XML out of the PDF's embedded files — this function only ever sees the XML text. */
export function parseCiiInvoice(xml: string): ParsedEInvoice {
  const doc = xmlParser.parse(xml);
  const invoice = doc["rsm:CrossIndustryInvoice"];
  if (!invoice) throw new Error("Missing CII <rsm:CrossIndustryInvoice> root element");

  const exchangedDocument = invoice["rsm:ExchangedDocument"] ?? {};
  const transaction = invoice["rsm:SupplyChainTradeTransaction"] ?? {};
  const agreement = transaction["ram:ApplicableHeaderTradeAgreement"] ?? {};
  const settlement = transaction["ram:ApplicableHeaderTradeSettlement"] ?? {};
  const summation = settlement["ram:SpecifiedTradeSettlementHeaderMonetarySummation"] ?? {};
  const paymentMeans = settlement["ram:SpecifiedTradeSettlementPaymentMeans"];
  const paymentTerms = settlement["ram:SpecifiedTradePaymentTerms"];

  const sellerParty = parseCiiParty(agreement["ram:SellerTradeParty"]);
  const iban = paymentMeans?.["ram:PayeePartyCreditorFinancialAccount"]?.["ram:IBANID"];

  const lines = toArray(transaction["ram:IncludedSupplyChainTradeLineItem"]).map((line: any): ParsedEInvoiceLine => {
    const lineSettlement = line["ram:SpecifiedLineTradeSettlement"] ?? {};
    return {
      description: textOf(line["ram:SpecifiedTradeProduct"]?.["ram:Name"]) ?? "",
      quantity: toNumber(line["ram:SpecifiedLineTradeDelivery"]?.["ram:BilledQuantity"]) ?? 0,
      unitPrice: toNumber(line["ram:SpecifiedLineTradeAgreement"]?.["ram:NetPriceProductTradePrice"]?.["ram:ChargeAmount"]) ?? 0,
      lineTotal: toNumber(lineSettlement["ram:SpecifiedTradeSettlementLineMonetarySummation"]?.["ram:LineTotalAmount"]) ?? 0,
      taxRatePercent: toNumber(lineSettlement["ram:ApplicableTradeTax"]?.["ram:RateApplicablePercent"]),
    };
  });

  return {
    invoiceNumber: textOf(exchangedDocument["ram:ID"]) ?? null,
    issueDate: toDate(exchangedDocument["ram:IssueDateTime"]?.["udt:DateTimeString"]),
    dueDate: toDate(paymentTerms?.["ram:DueDateDateTime"]?.["udt:DateTimeString"]),
    currency: textOf(settlement["ram:InvoiceCurrencyCode"]) ?? null,
    seller: sellerParty ? { ...sellerParty, iban: textOf(iban) ?? null } : null,
    buyer: parseCiiParty(agreement["ram:BuyerTradeParty"]),
    lines,
    subtotal: toNumber(summation["ram:TaxBasisTotalAmount"]),
    taxAmount: toNumber(summation["ram:TaxTotalAmount"]),
    total: toNumber(summation["ram:GrandTotalAmount"]),
  };
}

/** Dispatches to the right parser based on the already-detected format. */
export function parseEInvoiceXml(xml: string, format: IncomingEInvoiceFormat): ParsedEInvoice {
  if (format === "xrechnung_ubl" || format === "peppol_ubl") return parseUblInvoice(xml);
  return parseCiiInvoice(xml); // xrechnung_cii and zugferd share the same CII syntax
}

const ROUNDING_TOLERANCE = 0.02;

/**
 * A hand-built subset of EN 16931's Schematron business rules — the ones most likely to catch a
 * genuinely broken, incomplete, or fraudulent invoice, not the full ~200-rule spec. Every finding
 * is informational: staging and even conversion to a VendorBill are never blocked by this list,
 * since a human reviewing the bill is the actual control (see IncomingEInvoice's own doc comment)
 * — this just tells them what to look at more closely.
 */
export function validateEn16931Core(parsed: ParsedEInvoice): string[] {
  const errors: string[] = [];
  if (!parsed.invoiceNumber) errors.push("BR-1: missing invoice number");
  if (!parsed.issueDate) errors.push("BR-2: missing issue date");
  if (!parsed.currency || parsed.currency.length !== 3) errors.push("BR-5: missing or invalid document currency code");
  if (!parsed.seller?.name) errors.push("BR-6: missing seller name");
  if (!parsed.buyer?.name) errors.push("BR-7: missing buyer name");
  if (parsed.lines.length === 0) errors.push("BR-16: invoice has no line items");
  if (parsed.taxAmount && parsed.taxAmount > 0 && !parsed.seller?.vatId) {
    errors.push("BR-S-1: seller VAT identifier is missing despite a non-zero tax amount");
  }
  if (parsed.subtotal != null && parsed.taxAmount != null && parsed.total != null) {
    const expectedTotal = parsed.subtotal + parsed.taxAmount;
    if (Math.abs(expectedTotal - parsed.total) > ROUNDING_TOLERANCE) {
      errors.push(`BR-CO-15: total (${parsed.total}) does not equal subtotal + tax (${expectedTotal.toFixed(2)})`);
    }
  }
  if (parsed.subtotal != null && parsed.lines.length > 0) {
    const lineSum = parsed.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    if (Math.abs(lineSum - parsed.subtotal) > ROUNDING_TOLERANCE) {
      errors.push(`BR-CO-10: sum of line totals (${lineSum.toFixed(2)}) does not equal the invoice subtotal (${parsed.subtotal})`);
    }
  }
  return errors;
}
