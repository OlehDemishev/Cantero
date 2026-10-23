"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { pageTitleKey } from "@/lib/page-titles";

/**
 * The tab title for the current page ("Projects · Cantero"), from one table (lib/page-titles.ts)
 * instead of a hook in each of ~90 pages. Rendered as a React <title>, which React hoists into
 * <head> — so it is in the server-rendered HTML too, and follows client-side navigation. The root
 * layout's metadata deliberately sets no title, so there is only ever this one.
 */
export function PageTitle() {
  const t = useTranslations();
  const key = pageTitleKey(usePathname());
  return <title>{key ? `${t(key as never)} · Cantero` : "Cantero"}</title>;
}
