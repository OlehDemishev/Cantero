/** Maps our 5 launch locale codes to a full BCP-47 tag Intl.NumberFormat expects — same
 * locale set as SUPPORTED_LOCALES in @cantero/shared, kept here rather than imported since this
 * mapping is purely a frontend display concern. */
const LOCALE_TAGS: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  pl: "pl-PL",
  uk: "uk-UA",
};

/** Locale-aware money formatting (thousands separators, decimal marks, currency symbol
 * placement) via Intl.NumberFormat — replaces the raw `{amount} {currency}` interpolation used
 * throughout the app, which always renders "1234.56" regardless of the viewer's locale. Accepts
 * the amount as a string since most API responses serialize Decimal fields that way. */
export function formatCurrency(amount: number | string | null | undefined, currency: string, locale?: string): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  const tag = (locale && LOCALE_TAGS[locale]) || "en-US";
  try {
    return new Intl.NumberFormat(tag, { style: "currency", currency, currencyDisplay: "code" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Same locale-aware formatting for a plain number (percentages, quantities) with no currency
 * symbol — just the thousands/decimal conventions. */
export function formatNumber(value: number | string | null | undefined, locale?: string, maximumFractionDigits = 2): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return String(value);
  const tag = (locale && LOCALE_TAGS[locale]) || "en-US";
  return new Intl.NumberFormat(tag, { maximumFractionDigits }).format(n);
}
