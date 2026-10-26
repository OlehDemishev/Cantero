/** Maps our 5 launch locale codes to a full BCP-47 tag the Intl.* formatters expect — same
 * locale set as SUPPORTED_LOCALES in @cantero/shared, kept here rather than imported since this
 * mapping is purely a frontend display concern. Shared by format-currency.ts and format-date.ts
 * so both use the exact same locale-to-tag mapping. */
export const LOCALE_TAGS: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  pl: "pl-PL",
  uk: "uk-UA",
};

/** The Intl tag for an explicit locale code, else for the active UI locale: the root layout sets
 * <html lang> from the request locale (i18n/request.ts) and every locale switch reloads the page,
 * so it is always in sync and reachable from plain helpers without threading a locale prop. Public
 * token pages that switch to the company's language update it too (components/public-locale.tsx). */
export function resolveLocaleTag(locale?: string): string {
  const code = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  return LOCALE_TAGS[code] || "en-US";
}
