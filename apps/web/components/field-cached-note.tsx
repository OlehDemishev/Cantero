"use client";

import { useTranslations } from "next-intl";

/** Shown on a field tab when its data came from the offline cache rather than a fresh fetch. */
export function CachedNote({ cachedAt }: { cachedAt: number | null }) {
  const t = useTranslations("field");
  if (cachedAt == null) return null;
  return <p className="mb-2 text-xs text-warning-700 dark:text-warning-500">{t("cachedFrom", { time: new Date(cachedAt).toLocaleTimeString() })}</p>;
}
