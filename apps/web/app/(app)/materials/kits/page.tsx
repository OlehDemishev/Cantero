"use client";

import { useTranslations } from "next-intl";
import { StockKits } from "@/components/stock-kits";
import { PageHeader } from "@/components/ui/page-header";

export default function StockKitsPage() {
  const t = useTranslations("stockKits");

  return (
    <>
      <PageHeader title={t("title")} description={t("hint")} />
      <div className="mt-6">
        <StockKits />
      </div>
    </>
  );
}
