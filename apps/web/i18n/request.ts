import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["en", "de", "es"] as const;
export const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = SUPPORTED_LOCALES.includes(cookieLocale as any) ? (cookieLocale as string) : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
