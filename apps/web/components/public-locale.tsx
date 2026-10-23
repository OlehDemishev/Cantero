"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from "next-intl";
import { MESSAGE_LOADERS, isSupportedLocale } from "@/i18n/messages";
import { ApiErrorMessages } from "@/components/api-error-messages";

type Messages = ReturnType<typeof useMessages>;

const SetLocaleContext = createContext<((locale: string) => void) | null>(null);

function hasLocaleCookie(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)NEXT_LOCALE=/.test(document.cookie);
}

/**
 * Wraps a public token page (estimate, contract, survey, portal…) so it can switch to the language
 * the company works in — the server can only guess from the browser (i18n/request.ts), while the
 * token's API response knows the client's or company's language (`locale`). A person who picked a
 * language themselves (the NEXT_LOCALE cookie) keeps it. Always renders the same provider, so the
 * switch re-renders the page in place instead of remounting it (no refetch, no lost input).
 */
export function PublicLocaleProvider({ children }: { children: React.ReactNode }) {
  const initialLocale = useLocale();
  const initialMessages = useMessages();
  const timeZone = useTimeZone();
  const [state, setState] = useState<{ locale: string; messages: Messages }>({ locale: initialLocale, messages: initialMessages });
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    if (!requested || requested === state.locale || !isSupportedLocale(requested) || hasLocaleCookie()) return;
    let cancelled = false;
    MESSAGE_LOADERS[requested]()
      .then((mod) => {
        if (cancelled) return;
        // formatDate/formatCurrency and the Ukrainian font (globals.css) follow <html lang>
        document.documentElement.lang = requested;
        setState({ locale: requested, messages: mod.default as Messages });
      })
      .catch(() => {
        // the chunk didn't load (offline) — stay in the language already shown
      });
    return () => {
      cancelled = true;
    };
  }, [requested, state.locale]);

  return (
    <SetLocaleContext.Provider value={setRequested}>
      <NextIntlClientProvider locale={state.locale} messages={state.messages} timeZone={timeZone}>
        <ApiErrorMessages />
        {children}
      </NextIntlClientProvider>
    </SetLocaleContext.Provider>
  );
}

/** For the portals, whose pages each fetch their own data: asks the portal's /me once (when signed
 * in) and applies its `locale` to every page under the layout. */
export function LocaleFromSession({ load }: { load: () => Promise<{ locale?: string | null } | null> }) {
  const [locale, setLocale] = useState<string | null>(null);
  useEffect(() => {
    load()
      .then((me) => setLocale(me?.locale ?? null))
      .catch(() => {
        // not signed in or offline — the page handles that itself
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useCompanyLocale(locale);
  return null;
}

/** Call from a public page with the `locale` its token response returned (undefined while loading). */
export function useCompanyLocale(locale: string | null | undefined): void {
  const setLocale = useContext(SetLocaleContext);
  useEffect(() => {
    if (locale && setLocale) setLocale(locale);
  }, [locale, setLocale]);
}
