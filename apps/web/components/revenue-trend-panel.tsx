"use client";

import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueTrendRow {
  month: string;
  revenue: number;
}

export function RevenueTrendPanel() {
  const t = useTranslations("reports");
  const { data: revenueTrend = null, error: revenueTrendError, reload: reloadRevenueTrend } = useApi<RevenueTrendRow[]>("/reports/revenue-trend");

  async function downloadTaxSummary() {
    const blob = await apiFetch<Blob>("/reports/tax-summary");
    downloadBlob(blob, "tax-summary.csv");
  }

  return (
    <>
      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">{t("revenueTrend")}</h2>
        <button onClick={downloadTaxSummary} className="btn-secondary px-3 py-1 text-xs">
          {t("downloadTaxSummary")}
        </button>
      </div>
      {!revenueTrend ? (
        revenueTrendError ? <ErrorState error={revenueTrendError} onRetry={reloadRevenueTrend} compact /> : <Skeleton lines={3} />
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-2" style={{ minWidth: revenueTrend.length * 56 }}>
            {revenueTrend.map((r) => {
              const maxVal = Math.max(...revenueTrend.map((row) => row.revenue), 1);
              return (
                <div key={r.month} className="flex w-12 flex-col items-center gap-1">
                  <div className="text-2xs text-fg-subtle">{r.revenue}</div>
                  <div
                    className="w-6 rounded-t bg-brand-500"
                    style={{ height: `${Math.max((r.revenue / maxVal) * 96, 2)}px` }}
                  />
                  <div className="text-2xs text-fg-subtle">{r.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
