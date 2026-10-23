"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/browser";
import { resetStateInEffect } from "@/lib/effect-reset";

/** Root-level error boundary — catches a crash in the root layout itself (theme/i18n providers,
 * etc.), which app/error.tsx can't reach. Per Next's own docs this replaces the entire document,
 * including <html>/<body>, and does NOT get the app's global stylesheet — inline styles only,
 * no Tailwind classes, no next-intl (its provider is exactly what could have just crashed) — so
 * its three strings are inlined per language, picked from the NEXT_LOCALE cookie or the browser. */
const COPY = {
  en: { title: "Something went wrong", body: "The app hit an unexpected error. It's been reported — reloading usually fixes it.", retry: "Try again" },
  de: { title: "Etwas ist schiefgelaufen", body: "In der App ist ein unerwarteter Fehler aufgetreten. Er wurde gemeldet — Neuladen behebt ihn meistens.", retry: "Erneut versuchen" },
  es: { title: "Algo salió mal", body: "La aplicación tuvo un error inesperado. Ya se ha notificado; recargar la página suele solucionarlo.", retry: "Reintentar" },
  pl: { title: "Coś poszło nie tak", body: "W aplikacji wystąpił nieoczekiwany błąd. Został zgłoszony — zwykle pomaga odświeżenie strony.", retry: "Spróbuj ponownie" },
  uk: { title: "Щось пішло не так", body: "У застосунку сталася неочікувана помилка. Про неї вже повідомлено — зазвичай допомагає перезавантаження.", retry: "Спробувати ще раз" },
} as const;
type CopyLocale = keyof typeof COPY;

function detectLocale(): CopyLocale {
  const fromCookie = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([a-z]+)/)?.[1];
  const candidates = [fromCookie, ...(navigator.languages ?? [navigator.language]).map((l) => l.slice(0, 2).toLowerCase())];
  return (candidates.find((c): c is CopyLocale => !!c && c in COPY) ?? "en") as CopyLocale;
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // English on the server render, then the reader's language once mounted (no hydration mismatch)
  const [locale, setLocale] = useState<CopyLocale>("en");
  const copy = COPY[locale];

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    resetStateInEffect(() => setLocale(detectLocale()));
  }, []);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#111827",
          background: "#f9fafb",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>{copy.title}</h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
          {copy.body}
        </p>
        <button
          onClick={() => retry()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#465fff",
            color: "white",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {copy.retry}
        </button>
      </body>
    </html>
  );
}
