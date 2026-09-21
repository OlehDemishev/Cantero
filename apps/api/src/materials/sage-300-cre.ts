/**
 * Sage 300 CRE (Construction & Real Estate) "Accounts Payable > Tools > Import Invoices", Fixed
 * format — built from Sage's published field table ("What is the AP Import Invoices Fixed
 * Format?", Sage Knowledgebase): a comma-delimited text file of APIF (invoice header, 21 fields),
 * one APDF (distribution, 47 fields) per invoice line, and optional APTXF (tax) rows. Every field
 * slot is emitted even when empty, since the spec marks them all "required in format".
 *
 * Deliberately NOT covered, and worth knowing before relying on this:
 * - Not run through a real Sage 300 CRE (no license here) — do a test import into a scratch data
 *   set first, as Sage itself recommends; rejected rows land in the "rejected records" file.
 * - VendorBill carries net line amounts only, so Tax is left blank (Sage then sums the tax of the
 *   distributions, i.e. zero).
 * - Job / cost code / commitment / equipment / category are left blank: they're identifiers from
 *   the company's own Sage setup that nothing in Cantero knows. Only the GL expense and AP
 *   accounts can be supplied (blank is accepted when Sage can derive them from vendor defaults).
 * - Dates use MM/DD/YYYY; Sage reads them per the Date Format under Tools > Options.
 */

export interface SageApBill {
  billNumber: string;
  billDate: Date;
  dueDate: Date | null;
  scheduledPaymentDate: Date | null;
  notes?: string | null;
  supplierName: string;
  sageVendorId: string | null;
  lines: { description: string; quantity: number; unitPrice: number }[];
}

export interface SageApOptions {
  expenseAccount?: string;
  apAccount?: string;
}

const APIF_FIELDS = 21;
const APDF_FIELDS = 47;
const MAX_VENDOR_ID = 10;
const MAX_INVOICE_NUMBER = 15;
const MAX_DESCRIPTION = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

function usDate(date: Date | null): string {
  if (!date) return "";
  const d = date.toISOString();
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
}

/** Quotes only when needed. A leading =, +, - or @ is defused with a space so a spreadsheet
 * opening the file can't run it as a formula — Sage trims alpha fields, a formula is worse. */
function field(value: string): string {
  let v = value.replace(/[\r\n]+/g, " ");
  if (/^[=+\-@]/.test(v)) v = ` ${v}`;
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function row(fields: string[]): string {
  return fields.join(",");
}

export function assertSageBillsExportable(bills: SageApBill[]): void {
  const problems: string[] = [];
  for (const bill of bills) {
    if (!bill.sageVendorId) problems.push(`${bill.billNumber} (${bill.supplierName}): no Sage Vendor ID set on the supplier`);
    else if (bill.sageVendorId.length > MAX_VENDOR_ID) problems.push(`${bill.billNumber}: Sage Vendor ID "${bill.sageVendorId}" is longer than ${MAX_VENDOR_ID} characters`);
    if (bill.billNumber.length > MAX_INVOICE_NUMBER) problems.push(`${bill.billNumber}: invoice number is longer than Sage's ${MAX_INVOICE_NUMBER}-character limit`);
    if (bill.lines.length === 0) problems.push(`${bill.billNumber}: no lines to distribute`);
  }
  if (problems.length > 0) {
    throw new Error(`Can't export to Sage 300 CRE yet:\n${problems.join("\n")}`);
  }
}

export function buildSage300CreApInvoices(bills: SageApBill[], options: SageApOptions = {}): string {
  const lines: string[] = [];
  for (const bill of bills) {
    const distributions = bill.lines.map((l) => ({
      description: l.description,
      units: l.quantity,
      unitCost: l.unitPrice,
      amount: round2(l.quantity * l.unitPrice),
    }));
    // The header amount must equal the sum of the distributions or Sage rejects the invoice.
    const total = round2(distributions.reduce((sum, d) => sum + d.amount, 0));

    const header = Array<string>(APIF_FIELDS).fill("");
    header[0] = "APIF";
    header[1] = field(bill.sageVendorId ?? "");
    header[2] = field(bill.billNumber);
    header[3] = field((bill.notes ?? bill.supplierName).slice(0, MAX_DESCRIPTION));
    header[4] = total.toFixed(2);
    header[8] = usDate(bill.billDate); // Invoice Date
    header[9] = usDate(bill.billDate); // Date Received
    header[11] = usDate(bill.scheduledPaymentDate ?? bill.dueDate); // Payment Date
    lines.push(row(header));

    for (const d of distributions) {
      const dist = Array<string>(APDF_FIELDS).fill("");
      dist[0] = "APDF";
      dist[11] = field(options.expenseAccount ?? ""); // Expense account
      dist[12] = field(options.apAccount ?? ""); // AP account
      dist[15] = d.units.toFixed(4); // Units
      dist[16] = d.unitCost.toFixed(4); // Unit Cost
      dist[17] = d.amount.toFixed(2); // Amount
      dist[31] = field(d.description.slice(0, MAX_DESCRIPTION)); // Description
      lines.push(row(dist));
    }
  }
  return lines.join("\r\n") + (lines.length ? "\r\n" : "");
}
