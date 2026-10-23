import { resolveLocaleTag } from "./locale-tags";

export interface FormatNumberOptions {
  /** A locale code (en, de, …). Leave it out to format for the viewer's UI language, the same
   * fallback formatDate uses — numbers follow the reader, not the company that owns the data. */
  locale?: string;
  /** Exactly this many decimals (what a `.toFixed(n)` used to show). */
  fractionDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

function toNumber(value: number | string | null | undefined): number {
  return typeof value === "string" ? Number(value) : (value ?? 0);
}

function digits(options: FormatNumberOptions, defaults: { min?: number; max?: number }) {
  const min = options.fractionDigits ?? options.minimumFractionDigits ?? defaults.min;
  const max = options.fractionDigits ?? options.maximumFractionDigits ?? defaults.max;
  return {
    minimumFractionDigits: min !== undefined && max !== undefined ? Math.min(min, max) : min,
    maximumFractionDigits: max,
  };
}

/** Locale-aware money formatting (thousands separators, decimal marks, currency code placement)
 * via Intl.NumberFormat, in place of a raw `{amount} {currency}` that always reads "1234.5 EUR".
 * Accepts the amount as a string since most API responses serialize Decimal fields that way. The
 * currency is the company's (or the document's); the formatting is the viewer's UI language. */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
  options: FormatNumberOptions = {},
): string {
  const n = toNumber(amount);
  if (!Number.isFinite(n)) return `${amount ?? ""} ${currency ?? ""}`.trim();
  const tag = resolveLocaleTag(options.locale);
  if (!currency) return new Intl.NumberFormat(tag, digits(options, { min: 2, max: 2 })).format(n);
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      ...digits(options, {}),
    }).format(n);
  } catch {
    // not an ISO 4217 code
    return `${new Intl.NumberFormat(tag, digits(options, { min: 2, max: 2 })).format(n)} ${currency}`;
  }
}

/** Same locale-aware formatting for a plain number (percentages, quantities, hours) with no
 * currency — just the thousands/decimal conventions. Up to 2 decimals unless told otherwise. */
export function formatNumber(value: number | string | null | undefined, options: FormatNumberOptions = {}): string {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return new Intl.NumberFormat(resolveLocaleTag(options.locale), digits(options, { max: 2 })).format(n);
}
