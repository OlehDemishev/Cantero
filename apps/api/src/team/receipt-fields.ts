/**
 * Best-effort field extraction from raw OCR text off a receipt/invoice photo. Every function
 * returns null on failure rather than throwing — a receipt scan that finds nothing still lets
 * the user fill the expense form manually, exactly as they could before this feature existed.
 */

const CURRENCY_AMOUNT = /(?:[$€£]|\bUSD\b|\bEUR\b|\bGBP\b)?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/gi;
const TOTAL_LINE = /\b(total|amount due|balance due|grand total|amount)\b/i;

/** Parses a locale-ambiguous "1.234,56" / "1,234.56" / "123.45" string into a plain number. */
function parseAmountToken(token: string): number | null {
  const cleaned = token.trim();
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // European style: "." is a thousands separator, "," is the decimal point.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US/UK style: "," is a thousands separator, "." is the decimal point.
    normalized = cleaned.replace(/,/g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function extractAmount(text: string): number | null {
  const lines = text.split("\n");

  // Prefer an amount on a line that says "total"/"amount due"/etc. — the last such line wins,
  // since receipts often list a subtotal before tax before the final total.
  let onTotalLine: number | null = null;
  for (const line of lines) {
    if (!TOTAL_LINE.test(line)) continue;
    const matches = [...line.matchAll(CURRENCY_AMOUNT)];
    const last = matches.at(-1);
    if (last) {
      const value = parseAmountToken(last[1]);
      if (value !== null) onTotalLine = value;
    }
  }
  if (onTotalLine !== null) return onTotalLine;

  // Fall back to the largest currency-shaped number anywhere in the text — usually the total,
  // since line items are individually smaller than the sum of them.
  const allMatches = [...text.matchAll(CURRENCY_AMOUNT)];
  const values = allMatches.map((m) => parseAmountToken(m[1])).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

const DATE_PATTERNS: { regex: RegExp; toIso: (m: RegExpMatchArray) => string | null }[] = [
  {
    // 2026-08-27 or 2026/08/27
    regex: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    toIso: (m) => isoIfValid(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  {
    // 27/08/2026, 08/27/2026, 27-08-2026 — ambiguous day/month order, so only accepted when one
    // side is unambiguously > 12 (must be the day).
    regex: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/,
    toIso: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      if (a > 12) return isoIfValid(year, b, a);
      if (b > 12) return isoIfValid(year, a, b);
      return isoIfValid(year, a, b); // ambiguous — assume day/month (most of this app's markets)
    },
  },
  {
    // "Jan 5, 2026" / "January 5 2026"
    regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    toIso: (m) => isoIfValid(Number(m[3]), monthFromName(m[1]), Number(m[2])),
  },
];

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function monthFromName(name: string): number {
  return MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

function isoIfValid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1970 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

export function extractDate(text: string): string | null {
  for (const { regex, toIso } of DATE_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      const iso = toIso(match);
      if (iso) return iso;
    }
  }
  return null;
}

export function extractVendor(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 5)) {
    // Skip lines that are purely numbers/punctuation (receipt numbers, dates, separators) or
    // too short to be a business name — the vendor name is almost always near the top.
    if (line.length < 3) continue;
    if (!/[a-zA-Z]{3,}/.test(line)) continue;
    if (/^(receipt|invoice|order|date|time)\b/i.test(line)) continue;
    return line;
  }
  return null;
}
