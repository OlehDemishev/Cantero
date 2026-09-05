"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatCurrency } from "@/lib/format-currency";

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
  const money = (amount: number) => formatCurrency(amount, currency, me?.company.locale);

  const [report, setReport] = useState<WinRateReport | null>(null);

  useEffect(() => {
    apiFetch<WinRateReport>("/reports/win-rate").then(setReport);
  }, []);

  if (!report) return null;
  if (report.overall.decidedCount === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="text-xs text-gray-500">{t("winRate")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{report.overall.winRatePercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("decidedCount")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{report.overall.decidedCount}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("wonValue")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{money(report.overall.wonValue)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("averageDaysToDecision")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {report.overall.averageDaysToDecision !== null ? t("daysValue", { days: report.overall.averageDaysToDecision }) : "—"}
          </div>
        </div>
      </div>

      {report.byMonth.length > 0 && (
        <div className="card mt-3 overflow-x-auto">
          <div className="mb-2 text-xs font-semibold text-gray-700">{t("byMonth")}</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5">{t("month")}</th>
                <th className="text-right">{t("winRate")}</th>
                <th className="text-right">{t("wonCount")}</th>
                <th className="text-right">{t("lostCount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byMonth.map((row) => (
                <tr key={row.month} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium text-gray-900">{row.month}</td>
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
        <div className="card mt-3 overflow-x-auto">
          <div className="mb-2 text-xs font-semibold text-gray-700">{t("byMarginBand")}</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5">{t("marginBand")}</th>
                <th className="text-right">{t("winRate")}</th>
                <th className="text-right">{t("wonCount")}</th>
                <th className="text-right">{t("lostCount")}</th>
              </tr>
            </thead>
            <tbody>
              {report.byMarginBand.map((row) => (
                <tr key={row.band} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium text-gray-900">{row.band}</td>
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
