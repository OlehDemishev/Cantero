/**
 * Best-effort field extraction from raw OCR text off a receipt/invoice photo. Every function
 * returns null on failure rather than throwing — a receipt scan that finds nothing still lets
 * the user fill the expense form manually, exactly as they could before this feature existed.
 */

const CURRENCY_AMOUNT = /(?:[$€£]|\bUSD\b|\bEUR\b|\bGBP\b|\bPLN\b|\bUAH\b)?\s*(\d{1,3}(?:[.,  ]\d{3})*[.,]\d{2})(?!\d)/giu;

/**
 * Lines that carry the amount to pay, in the languages the OCR reads (English, German, Polish,
 * Ukrainian). `(?<!\p{L})…(?!\p{L})` instead of `\b`: JavaScript's `\b` treats "ä" or Cyrillic
 * as non-word characters, so "Сума" would never match between word boundaries.
 */
const TOTAL_WORDS = [
  "total", "amount due", "balance due", "grand total", "amount",
  "summe", "gesamt", "gesamtbetrag", "endbetrag", "zu zahlen", "zahlbetrag", "rechnungsbetrag", "betrag",
  "suma", "razem", "do zapłaty", "należność",
  "сума", "разом", "всього", "до сплати",
];
const TOTAL_LINE = new RegExp(`(?<!\\p{L})(${TOTAL_WORDS.join("|")})(?!\\p{L})`, "iu");
/** Tax and subtotal lines mention "Summe"/"Betrag" too ("MwSt-Betrag", "Zwischensumme"), but their
 * amount isn't what was paid. */
const NOT_TOTAL_LINE = /mwst|ust\b|umsatzsteuer|steuer|vat|tax|netto|zwischensumme|subtotal|sub-total|podatek|ptu|пдв|податок|rabatt|discount/iu;

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
    if (!TOTAL_LINE.test(line) || NOT_TOTAL_LINE.test(line)) continue;
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
    // 27.08.2026 — German, Polish and Ukrainian receipts: always day.month.year.
    regex: /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/,
    toIso: (m) => isoIfValid(fullYear(m[3]), Number(m[2]), Number(m[1])),
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
  {
    // "5. März 2026" / "27 Aug 2026"
    regex: /\b(\d{1,2})\.?\s+(Jan|Feb|Mär|Mrz|Mar|Apr|Mai|May|Jun|Jul|Aug|Sep|Okt|Oct|Nov|Dez|Dec)\p{L}*\.?\s+(\d{4})\b/iu,
    toIso: (m) => isoIfValid(Number(m[3]), monthFromName(m[2]), Number(m[1])),
  },
];

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, mrz: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
};
function monthFromName(name: string): number {
  const lower = name.toLowerCase();
  return MONTH_NAMES[lower] ?? MONTH_NAMES[lower.slice(0, 3)] ?? 0;
}

/** "26" on a receipt is 2026 — a receipt is never from the previous century. */
function fullYear(y: string): number {
  return y.length === 2 ? 2000 + Number(y) : Number(y);
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
    // Any script: "Bäckerei Müller", "Budmat Sp. z o.o.", "Епіцентр".
    if (!/\p{L}{3,}/u.test(line)) continue;
    if (/^(receipt|invoice|order|date|time|rechnung|beleg|kassenbon|quittung|bon|datum|uhrzeit|kasse|paragon|faktura|paragon fiskalny|чек|квитанція|рахунок|дата)(?!\p{L})/iu.test(line)) continue;
    return line;
  }
  return null;
}
