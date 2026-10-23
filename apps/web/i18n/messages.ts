import { SUPPORTED_LOCALES, type Locale } from "@cantero/shared";

/** The catalogs live in @cantero/shared so the mobile client renders the same strings. They have to
 * be listed one by one rather than built from a template literal: no bundler can generate a dynamic
 * require context across a package boundary, and the standalone output tracer (next.config.ts) can
 * only follow imports it sees statically. The annotation is also what keeps `tsc` from inferring
 * the full literal shape of five ~200KB JSON files on every typecheck. Used by the request config
 * (server) and by public token pages that switch to the company's language (client). */
export const MESSAGE_LOADERS: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("@cantero/shared/messages/en.json"),
  de: () => import("@cantero/shared/messages/de.json"),
  es: () => import("@cantero/shared/messages/es.json"),
  pl: () => import("@cantero/shared/messages/pl.json"),
  uk: () => import("@cantero/shared/messages/uk.json"),
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The best supported locale for an Accept-Language header ("uk-UA,uk;q=0.9,en;q=0.8"): highest
 * q first, an exact or primary-subtag match ("de-AT" → de), null when nothing matches. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return null;
}
