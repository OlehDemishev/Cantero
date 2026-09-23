"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

/**
 * The language this person reads Cantero in — here and in the phone app. Left on the company's
 * default it follows whatever the company switches to; a pick of their own stays with them.
 */
export function LanguagePanel() {
  const t = useTranslations("settings");
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function choose(value: string) {
    setBusy(true);
    try {
      const res = await apiFetch<{ locale: Locale }>("/me/language", { method: "PATCH", body: JSON.stringify({ locale: value || null }) });
      document.cookie = `NEXT_LOCALE=${res.locale};path=/;max-age=31536000`;
      // The root layout reads the cookie server-side, so the whole page reloads in the new language.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2" aria-labelledby="my-language-title">
      <h2 id="my-language-title" className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("myLanguage")}
      </h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("myLanguageHint")}</p>
      <select className="input w-auto" aria-label={t("myLanguage")} value={me.user.locale ?? ""} disabled={busy} onChange={(e) => choose(e.target.value)}>
        <option value="">{t("companyLanguage", { language: LOCALE_NAMES[me.company.locale] })}</option>
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </section>
  );
}
