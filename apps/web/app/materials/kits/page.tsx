"use client";

import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { StockKits } from "@/components/stock-kits";

export default function StockKitsPage() {
  const t = useTranslations("stockKits");

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("hint")}</p>
      <div className="mt-6">
        <StockKits />
      </div>
    </AuthenticatedShell>
  );
}
