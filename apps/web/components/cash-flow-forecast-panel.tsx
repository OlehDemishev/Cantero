"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/format-currency";

interface CashFlowWeek {
  weekStart: string;
  weekEnd: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulativeNet: number;
}
interface CashFlowForecast {
  windowWeeks: number;
  unscheduledInflow: number;
  unscheduledOutflow: number;
  weeks: CashFlowWeek[];
  totals: { inflow: number; outflow: number; net: number };
}

export function CashFlowForecastPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null);

  useEffect(() => {
    apiFetch<CashFlowForecast>("/reports/cash-flow-forecast").then(setCashFlow);
  }, []);

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-fg-muted">{t("cashFlowForecast")}</h2>
      {!cashFlow ? (
        <p className="text-fg-subtle">{tc("loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("projectedInflow")}</div>
              <div className="mt-1 text-lg font-semibold text-success-fg">
                {formatCurrency(cashFlow.totals.inflow, currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("projectedOutflow")}</div>
              <div className="mt-1 text-lg font-semibold text-danger-fg">
                {formatCurrency(cashFlow.totals.outflow, currency)}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("projectedNet")}</div>
              <div className={`mt-1 text-lg font-semibold ${cashFlow.totals.net < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                {formatCurrency(cashFlow.totals.net, currency)}
              </div>
            </div>
          </div>

          {(cashFlow.unscheduledInflow > 0 || cashFlow.unscheduledOutflow > 0) && (
            <p className="mt-2 text-xs text-fg-subtle">
              {t("unscheduledNote", { inflow: formatCurrency(cashFlow.unscheduledInflow, currency), outflow: formatCurrency(cashFlow.unscheduledOutflow, currency) })}
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="mb-3 flex items-center gap-3 text-xs text-fg-subtle">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success-500" /> {t("inflow")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-500" /> {t("outflow")}
              </span>
            </div>
            {(() => {
              const maxVal = Math.max(...cashFlow.weeks.flatMap((w) => [w.inflow, w.outflow]), 1);
              return (
                <div className="flex items-end gap-2" style={{ minWidth: cashFlow.weeks.length * 56 }}>
                  {cashFlow.weeks.map((w, i) => (
                    <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-24 items-end gap-0.5">
                        <div
                          className="w-3 rounded-t bg-success-500"
                          style={{ height: `${(w.inflow / maxVal) * 100}%` }}
                          title={`${t("inflow")}: ${formatCurrency(w.inflow, currency)}`}
                        />
                        <div
                          className="w-3 rounded-t bg-error-500"
                          style={{ height: `${(w.outflow / maxVal) * 100}%` }}
                          title={`${t("outflow")}: ${formatCurrency(w.outflow, currency)}`}
                        />
                      </div>
                      <span className="text-[10px] text-fg-subtle">{t("weekLabel", { n: i + 1 })}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th className="py-2">{t("week")}</th>
                  <th className="text-right">{t("inflow")}</th>
                  <th className="text-right">{t("outflow")}</th>
                  <th className="text-right">{t("net")}</th>
                  <th className="text-right">{t("cumulativeNet")}</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{formatDate(new Date(w.weekStart))}</td>
                    <td className="text-right text-success-fg">
                      {formatCurrency(w.inflow, currency)}
                    </td>
                    <td className="text-right text-danger-fg">
                      {formatCurrency(w.outflow, currency)}
                    </td>
                    <td className={`text-right ${w.net < 0 ? "text-danger-fg" : "text-fg-muted"}`}>
                      {formatCurrency(w.net, currency)}
                    </td>
                    <td className={`text-right font-medium ${w.cumulativeNet < 0 ? "text-danger-fg" : "text-fg"}`}>
                      {formatCurrency(w.cumulativeNet, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
