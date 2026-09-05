import { LOCALE_TAGS } from "./locale-tags";

/**
 * Locale-aware date formatting via Intl.DateTimeFormat — the date equivalent of formatCurrency,
 * built for the same reason: a bare `.toLocaleDateString()` call (used across most of this app)
 * reads the *browser's* locale, not the language the user actually picked in Cantero, so a user
 * who switches the app to Ukrainian still sees every date in whatever locale their OS happens to
 * be set to.
 *
 * Falls back to the <html lang> attribute set by the root layout from the NEXT_LOCALE cookie
 * (see i18n/request.ts) when no explicit locale is passed — every locale switch in this app does
 * a full page reload, so this is always in sync and works from any component, hook, or plain
 * helper function without threading a locale prop everywhere. */
function resolveTag(locale?: string): string {
  const code = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  return LOCALE_TAGS[code] || "en-US";
}

export function formatDate(value: string | Date | null | undefined, locale?: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(resolveTag(locale)).format(date);
}

/** Same as formatDate, but includes the time of day — for timestamps (audit log entries, session activity) rather than plain dates. */
export function formatDateTime(value: string | Date | null | undefined, locale?: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(resolveTag(locale), { dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Same locale detection as formatDate, but for compact custom layouts (calendar ticks, forecast day
 * labels) that need a specific Intl.DateTimeFormatOptions shape instead of the default date style. */
export function formatDateWithOptions(value: string | number | Date | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(resolveTag(), options).format(date);
}
