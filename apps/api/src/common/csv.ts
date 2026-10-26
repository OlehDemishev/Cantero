/** A plain number, which a spreadsheet reads as a number rather than a formula even with a sign. */
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;

/**
 * Quotes a cell when it needs it and defuses spreadsheet formula injection: a cell starting with
 * =, +, -, @, tab or CR (a lead's name from the public form, say) gets a leading `'`, which
 * Excel/LibreOffice/Sheets treat as "this is text". Plain signed numbers ("-12.50") are left as
 * they are so number columns stay numbers.
 */
export function csvEscape(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

/**
 * Parses CSV text (RFC4180-ish: quoted fields, "" for an escaped quote, quoted fields may
 * contain commas/newlines) into an array of rows of raw string cells. The first row is not
 * treated specially here — callers that expect a header row slice it off themselves.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);

  return rows;
}

/** Parses CSV text with a header row into objects keyed by (trimmed, lowercased) header name. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return dataRows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, i) => {
      record[key] = (row[i] ?? "").trim();
    });
    return record;
  });
}
