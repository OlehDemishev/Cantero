"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

interface RevenueTrendRow {
  month: string;
  revenue: number;
}

export function RevenueTrendPanel() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendRow[] | null>(null);

  useEffect(() => {
    apiFetch<RevenueTrendRow[]>("/reports/revenue-trend").then(setRevenueTrend);
  }, []);

  async function downloadTaxSummary() {
    const blob = await apiFetch<Blob>("/reports/tax-summary");
    downloadBlob(blob, "tax-summary.csv");
  }

  return (
    <>
      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("revenueTrend")}</h2>
        <button onClick={downloadTaxSummary} className="btn-secondary px-3 py-1 text-xs">
          {t("downloadTaxSummary")}
        </button>
      </div>
      {!revenueTrend ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-2" style={{ minWidth: revenueTrend.length * 56 }}>
            {revenueTrend.map((r) => {
              const maxVal = Math.max(...revenueTrend.map((row) => row.revenue), 1);
              return (
                <div key={r.month} className="flex w-12 flex-col items-center gap-1">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{r.revenue}</div>
                  <div
                    className="w-6 rounded-t bg-brand-500"
                    style={{ height: `${Math.max((r.revenue / maxVal) * 96, 2)}px` }}
                  />
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{r.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
