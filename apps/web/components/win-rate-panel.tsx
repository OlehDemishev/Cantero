"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface WinRateSlice {
  decidedCount: number;
  wonCount: number;
  lostCount: number;
  winRatePercent: number | null;
  wonValue: number;
  lostValue: number;
  averageDaysToDecision: number | null;
}
interface WinRateReport {
  overall: WinRateSlice;
  byMonth: (WinRateSlice & { month: string })[];
  byMarginBand: (WinRateSlice & { band: string })[];
}

export function WinRatePanel() {
  const t = useTranslations("winRate");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "USD";
  const money = (amount: number) => formatCurrency(amount, currency);

  const { data: report = null, error: reportError, reload: reloadReport } = useApi<WinRateReport>("/reports/win-rate");

  if (!report) return reportError ? <ErrorState error={reportError} onRetry={reloadReport} compact /> : <Skeleton lines={3} />;
  if (report.overall.decidedCount === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("winRate")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{report.overall.winRatePercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("decidedCount")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{report.overall.decidedCount}</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("wonValue")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{money(report.overall.wonValue)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("averageDaysToDecision")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">
            {report.overall.averageDaysToDecision !== null ? t("daysValue", { days: report.overall.averageDaysToDecision }) : "—"}
          </div>
        </div>
      </div>

      {report.byMonth.length > 0 && (
        <div tabIndex={0} className="card mt-3 overflow-x-auto">
          <div className="mb-2 text-xs font-semibold text-fg-muted">{t("byMonth")}</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-1.5">{t("month")}</th>
                <th scope="col" className="text-right">{t("winRate")}</th>
                <th scope="col" className="text-right">{t("wonCount")}</th>
                <th scope="col" className="text-right">{t("lostCount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byMonth.map((row) => (
                <tr key={row.month} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1.5 font-medium text-fg">{row.month}</td>
                  <td className="text-right tabular-nums">{row.winRatePercent}%</td>
                  <td className="text-right tabular-nums">{row.wonCount}</td>
                  <td className="text-right tabular-nums">{row.lostCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.byMarginBand.length > 0 && (
        <div tabIndex={0} className="card mt-3 overflow-x-auto">
          <div className="mb-2 text-xs font-semibold text-fg-muted">{t("byMarginBand")}</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-1.5">{t("marginBand")}</th>
                <th scope="col" className="text-right">{t("winRate")}</th>
                <th scope="col" className="text-right">{t("wonCount")}</th>
                <th scope="col" className="text-right">{t("lostCount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byMarginBand.map((row) => (
                <tr key={row.band} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1.5 font-medium text-fg">{row.band}</td>
                  <td className="text-right tabular-nums">{row.winRatePercent}%</td>
                  <td className="text-right tabular-nums">{row.wonCount}</td>
                  <td className="text-right tabular-nums">{row.lostCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
