"use client";

import { useTranslations } from "next-intl";
import { formatDateWithOptions } from "@/lib/format-date";

/** Shown on a field tab when its data came from the offline cache rather than a fresh fetch. */
export function CachedNote({ cachedAt }: { cachedAt: number | null }) {
  const t = useTranslations("field");
  if (cachedAt == null) return null;
  return <p className="mb-2 text-xs text-warning-fg">{t("cachedFrom", { time: formatDateWithOptions(cachedAt, { timeStyle: "short" }) })}</p>;
}
