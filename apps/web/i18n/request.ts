import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@cantero/shared";

/** The catalogs live in @cantero/shared so the mobile client renders the same strings. They have to
 * be listed one by one rather than built from a template literal: no bundler can generate a dynamic
 * require context across a package boundary, and the standalone output tracer (next.config.ts) can
 * only follow imports it sees statically. The annotation is also what keeps `tsc` from inferring
 * the full literal shape of five ~200KB JSON files on every typecheck. */
const MESSAGE_LOADERS: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("@cantero/shared/messages/en.json"),
  de: () => import("@cantero/shared/messages/de.json"),
  es: () => import("@cantero/shared/messages/es.json"),
  pl: () => import("@cantero/shared/messages/pl.json"),
  uk: () => import("@cantero/shared/messages/uk.json"),
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await MESSAGE_LOADERS[locale]()).default,
  };
});
