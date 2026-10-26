import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, type Locale } from "@cantero/shared";
import { MESSAGE_LOADERS, isSupportedLocale, localeFromAcceptLanguage } from "./messages";

/** The language a person picked (NEXT_LOCALE cookie, set at sign-in and by the language switcher)
 * wins; without one — a client opening an emailed estimate link, a visitor on /login — the browser's
 * Accept-Language decides, then English. Public token pages can still switch to the language the
 * company sends its documents in (components/public-locale.tsx) when there is no cookie. */
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : (localeFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE);

  return {
    locale,
    messages: (await MESSAGE_LOADERS[locale]()).default,
  };
});
