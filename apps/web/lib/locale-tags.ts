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
