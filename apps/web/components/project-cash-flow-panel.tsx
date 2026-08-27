"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface CashFlowWeek {
  weekStart: string;
  inflow: number;
  outflow: number;
}
interface CashFlowForecast {
  weeks: CashFlowWeek[];
  totals: { inflow: number; outflow: number; net: number };
}

/** The same 13-week forecast as the company-wide report, scoped to one project — purchase
 * orders are never included here since they aren't attributable to a specific job. */
export function ProjectCashFlowPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("reports");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null);

  useEffect(() => {
    apiFetch<CashFlowForecast>(`/reports/cash-flow-forecast?projectId=${projectId}`).then(setCashFlow);
  }, [projectId]);

  if (!cashFlow) return null;
  if (cashFlow.totals.inflow === 0 && cashFlow.totals.outflow === 0) return null;

  const maxVal = Math.max(...cashFlow.weeks.flatMap((w) => [w.inflow, w.outflow]), 1);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("cashFlowForecast")}</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-gray-500">{t("projectedInflow")}</div>
          <div className="mt-1 text-lg font-semibold text-success-700">
            {cashFlow.totals.inflow} {currency}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("projectedOutflow")}</div>
          <div className="mt-1 text-lg font-semibold text-error-700">
            {cashFlow.totals.outflow} {currency}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("projectedNet")}</div>
          <div className={`mt-1 text-lg font-semibold ${cashFlow.totals.net < 0 ? "text-error-700" : "text-success-700"}`}>
            {cashFlow.totals.net} {currency}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-end gap-2" style={{ minWidth: cashFlow.weeks.length * 40 }}>
          {cashFlow.weeks.map((w, i) => (
            <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-16 items-end gap-0.5">
                <div className="w-2.5 rounded-t bg-success-500" style={{ height: `${(w.inflow / maxVal) * 100}%` }} title={`${t("inflow")}: ${w.inflow} ${currency}`} />
                <div className="w-2.5 rounded-t bg-error-500" style={{ height: `${(w.outflow / maxVal) * 100}%` }} title={`${t("outflow")}: ${w.outflow} ${currency}`} />
              </div>
              <span className="text-[10px] text-gray-400">{t("weekLabel", { n: i + 1 })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
