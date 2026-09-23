import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCalendars, getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
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

/** The language the app last showed — the signed-in person's (their own pick, else their company's),
 * kept so the next launch opens in it straight away, even offline. */
const STORAGE_KEY = "cantero_locale";

function resolveDeviceLocale(): Locale {
  for (const { languageCode } of getLocales()) {
    if (hasLocale(SUPPORTED_LOCALES, languageCode)) return languageCode;
  }
  return DEFAULT_LOCALE;
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

/** The app's language and a way to change it (after /me or the language picker says so). */
export const useAppLocale = () => useContext(LocaleContext);

/**
 * Before anyone has signed in on this phone the device language is used; once signed in, the
 * language their profile says (Settings → Account on the web, or the picker in the app's header).
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale | null>(null);
  const timeZone = useMemo(() => getCalendars()[0]?.timeZone ?? undefined, []);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => setLocaleState(stored && hasLocale(SUPPORTED_LOCALES, stored) ? stored : resolveDeviceLocale()))
      .catch(() => setLocaleState(resolveDeviceLocale()));
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);
  const value = useMemo(() => ({ locale: locale ?? DEFAULT_LOCALE, setLocale }), [locale, setLocale]);

  // A moment on launch while the stored choice is read — rather than a flash of the wrong language.
  if (!locale) return null;
  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={CATALOGS[locale]} timeZone={timeZone}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
