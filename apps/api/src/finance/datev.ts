/**
 * DATEV "Buchungsstapel" (EXTF, format category 21) export — the standard interchange format for
 * handing a batch of accounting entries to DATEV Rechnungswesen / a Steuerberater. Unlike
 * XRechnung/GAEB/ZUGFeRD this isn't a public standard with a stable public schema: DATEV's current
 * EXTF spec has 40+ mostly-optional columns and revises yearly. This module deliberately targets
 * only the stable **core** Buchungsstapel columns (amount, debit/credit flag, account, contra
 * account, tax key, document date, document number, posting text) that have been part of every
 * version of this format for years, rather than attempting the newest full spec — the same
 * "hand-built, honest subset, not run through the official validator" spirit as e-invoice.ts/
 * gaeb.ts/zugferd.ts, but with lower confidence than those three (which are public, stable
 * standards). UTF-8 encoded, not the classic Windows-1252/ANSI some older DATEV desktop clients
 * prefer. **Do one test import with the customer's actual DATEV setup/Steuerberater before relying
 * on this for real bookkeeping.**
 */

export function formatDatevAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/** DDMMYYYY — DATEV's row-level Belegdatum format (distinct from the header's YYYYMMDD dates). */
export function formatDatevDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

/**
 * Quotes a text field, and neutralizes CSV/spreadsheet formula injection (CWE-1236): Buchungstext
 * and Belegfeld 1 carry free-form user data (client/subcontractor names, invoice numbers) that
 * DATEV itself only ever reads as literal text, but an accountant sanity-checking the export by
 * opening it in Excel/LibreOffice/Google Sheets would have a value like `=1+1` or a
 * `=cmd|'/c calc'!A1`-style payload executed as a formula. Prefixing a leading =, +, -, @, or
 * tab/CR with a single quote is the standard mitigation — spreadsheet apps treat a leading `'` as
 * a plain-text marker (not itself displayed), and it's just another harmless literal character to
 * a real DATEV importer, which doesn't interpret this column as a formula at all.
 */
function quoted(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export interface DatevHeaderInput {
  companyName: string;
  createdAt: Date;
  consultantNumber: string;
  clientNumber: string;
  fiscalYearStart: Date;
  sachkontenlaenge: number;
  batchFrom: Date;
  batchTo: Date;
  label: string;
}

/**
 * The metadata row every Buchungsstapel file opens with. Buchungstyp is fixed at 2
 * (Debitoren/Kreditoren-style) since every posting's `Konto` below is a client's Debitor number or
 * a subcontractor's Kreditor number, not a plain Sachkonto.
 */
export function buildDatevHeader(input: DatevHeaderInput): string {
  const createdTimestamp = `${input.createdAt.getUTCFullYear()}${String(input.createdAt.getUTCMonth() + 1).padStart(2, "0")}${String(
    input.createdAt.getUTCDate(),
  ).padStart(2, "0")}${String(input.createdAt.getUTCHours()).padStart(2, "0")}${String(input.createdAt.getUTCMinutes()).padStart(2, "0")}${String(
    input.createdAt.getUTCSeconds(),
  ).padStart(2, "0")}000`;
  const isoDate = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

  const fields = [
    quoted("EXTF"),
    "510",
    "21",
    quoted("Buchungsstapel"),
    "7",
    createdTimestamp,
    "",
    quoted("RE"),
    quoted(input.companyName),
    "",
    input.consultantNumber,
    input.clientNumber,
    isoDate(input.fiscalYearStart),
    String(input.sachkontenlaenge),
    isoDate(input.batchFrom),
    isoDate(input.batchTo),
    quoted(input.label),
    "",
    "2",
    "0",
    "0",
    quoted("EUR"),
  ];
  return fields.join(";");
}

export const DATEV_COLUMN_HEADER = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
].join(";");

export interface DatevPostingInput {
  amount: number;
  konto: string;
  gegenkonto: string;
  belegdatum: Date;
  belegfeld1: string;
  buchungstext: string;
}

/** One posting row. Soll/Haben is always "S" (debit to `Konto`) — every export in this module
 * only ever produces straightforward revenue/expense postings, never reversals or credit notes. */
export function buildDatevPostingRow(input: DatevPostingInput): string {
  const fields = [
    formatDatevAmount(input.amount),
    "S",
    quoted("EUR"),
    "",
    "",
    "",
    input.konto,
    input.gegenkonto,
    "",
    formatDatevDate(input.belegdatum),
    quoted(input.belegfeld1),
    "",
    "",
    quoted(input.buchungstext),
  ];
  return fields.join(";");
}

export function buildDatevBuchungsstapelCsv(header: string, rows: string[]): string {
  return [header, DATEV_COLUMN_HEADER, ...rows].join("\r\n");
}

/**
 * The actual fiscal-year-start date (with a concrete year) for whichever fiscal year `reference`
 * falls into, given a company's fiscal year start month/day — handles a non-calendar fiscal year
 * (e.g. starting April 1st) rather than assuming January 1st.
 */
export function resolveDatevFiscalYearStart(startMonth: number, startDay: number, reference: Date): Date {
  const year = reference.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, startMonth - 1, startDay));
  return candidate.getTime() <= reference.getTime() ? candidate : new Date(Date.UTC(year - 1, startMonth - 1, startDay));
}
