"use client";

import { useTranslations } from "next-intl";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

const OPTIONS: { value: ThemePreference; labelKey: "themeSystem" | "themeLight" | "themeDark" }[] = [
  { value: "system", labelKey: "themeSystem" },
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
];

/** Light / dark / follow the OS. Per browser (localStorage), like the header's quick toggle. */
export function AppearancePanel() {
  const t = useTranslations("settings");
  const { preference, setPreference } = useTheme();

  return (
    <section className="card lg:col-span-2" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="mb-1 text-sm font-semibold text-fg-muted">
        {t("appearance")}
      </h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("appearanceHint")}</p>
      <div role="radiogroup" aria-labelledby="appearance-title" className="inline-flex rounded-lg border border-border-strong p-0.5">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-fg-subtle has-checked:bg-brand-50 has-checked:text-brand-700 dark:has-checked:text-brand-fg has-focus-visible:ring-2 has-focus-visible:ring-focus dark:has-checked:bg-brand-500/[0.12]"
          >
            <input
              type="radio"
              name="theme-preference"
              value={o.value}
              checked={preference === o.value}
              onChange={() => setPreference(o.value)}
              className="sr-only"
            />
            {t(o.labelKey)}
          </label>
        ))}
      </div>
    </section>
  );
}
