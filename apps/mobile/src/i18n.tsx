import { useMemo, type ReactNode } from "react";
import { getCalendars, getLocales } from "expo-localization";
import { hasLocale, IntlProvider } from "use-intl";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@cantero/shared";
import de from "@cantero/shared/messages/de.json";
import en from "@cantero/shared/messages/en.json";
import es from "@cantero/shared/messages/es.json";
import pl from "@cantero/shared/messages/pl.json";
import uk from "@cantero/shared/messages/uk.json";

/** All five catalogs ship in the bundle rather than being fetched: a crew on site regularly has no
 * connectivity, and switching language is not worth a network round trip there. */
const CATALOGS: Record<Locale, Record<string, unknown>> = { de, en, es, pl, uk };

function resolveDeviceLocale(): Locale {
  for (const { languageCode } of getLocales()) {
    if (hasLocale(SUPPORTED_LOCALES, languageCode)) return languageCode;
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useMemo(resolveDeviceLocale, []);
  const timeZone = useMemo(() => getCalendars()[0]?.timeZone ?? undefined, []);

  return (
    <IntlProvider locale={locale} messages={CATALOGS[locale]} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}
