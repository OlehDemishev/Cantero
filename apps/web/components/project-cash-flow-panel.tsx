"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { useReportAccess } from "@/lib/report-access";
import { formatCurrency } from "@/lib/format-currency";

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
  const allowed = useReportAccess()("cash-flow-forecast");

  useEffect(() => {
    if (!allowed) return;
    apiFetch<CashFlowForecast>(`/reports/cash-flow-forecast?projectId=${projectId}`).then(setCashFlow);
  }, [projectId, allowed]);

  if (!cashFlow) return null;
  if (cashFlow.totals.inflow === 0 && cashFlow.totals.outflow === 0) return null;

  const maxVal = Math.max(...cashFlow.weeks.flatMap((w) => [w.inflow, w.outflow]), 1);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("cashFlowForecast")}</h2>
      <div className="grid grid-cols-3 gap-3">
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-end gap-2" style={{ minWidth: cashFlow.weeks.length * 40 }}>
          {cashFlow.weeks.map((w, i) => (
            <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-16 items-end gap-0.5">
                <div className="w-2.5 rounded-t bg-success-500" style={{ height: `${(w.inflow / maxVal) * 100}%` }} title={`${t("inflow")}: ${formatCurrency(w.inflow, currency)}`} />
                <div className="w-2.5 rounded-t bg-error-500" style={{ height: `${(w.outflow / maxVal) * 100}%` }} title={`${t("outflow")}: ${formatCurrency(w.outflow, currency)}`} />
              </div>
              <span className="text-[10px] text-fg-subtle">{t("weekLabel", { n: i + 1 })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
