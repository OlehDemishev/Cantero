"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface BudgetVsActual {
  estimatesCount: number;
  materialsCostBudget: number;
  materialsCostActual: number;
  materialsCostVariance: number;
  laborCostBudget: number;
  laborCostActual: number;
  laborCostVariance: number;
  laborHoursLogged: number;
  laborHoursUncosted: number;
  grandTotalBudget: number;
  invoicedTotal: number;
  paidTotal: number;
  outstandingTotal: number;
}

export function BudgetPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("budget");
  const { data: me } = useMe();
  const [budget, setBudget] = useState<BudgetVsActual | null>(null);

  useEffect(() => {
    apiFetch<BudgetVsActual>(`/finance/budget-vs-actual?projectId=${projectId}`).then(setBudget);
  }, [projectId]);

  if (!budget) return null;
  const currency = me?.company.currency ?? "";

  if (budget.estimatesCount === 0) {
    return (
      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
        <p className="text-sm text-gray-400">{t("noApprovedEstimates")}</p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BudgetCard
          title={t("materialsCost")}
          rows={[
            [t("budget"), `${budget.materialsCostBudget} ${currency}`],
            [t("actual"), `${budget.materialsCostActual} ${currency}`],
            [
              t("variance"),
              `${budget.materialsCostVariance >= 0 ? "+" : ""}${budget.materialsCostVariance} ${currency}`,
              budget.materialsCostVariance < 0 ? "text-red-600" : "text-green-700",
            ],
          ]}
        />
        <BudgetCard
          title={t("laborCost")}
          rows={[
            [t("budget"), `${budget.laborCostBudget} ${currency}`],
            [t("actual"), `${budget.laborCostActual} ${currency}`],
            [
              t("variance"),
              `${budget.laborCostVariance >= 0 ? "+" : ""}${budget.laborCostVariance} ${currency}`,
              budget.laborCostVariance < 0 ? "text-red-600" : "text-green-700",
            ],
            [t("hoursLogged"), `${budget.laborHoursLogged}h`],
            ...(budget.laborHoursUncosted > 0
              ? ([[t("hoursUncosted"), `${budget.laborHoursUncosted}h`]] as [string, string][])
              : []),
          ]}
        />
        <BudgetCard
          title={t("grandTotalBudget")}
          rows={[
            [t("grandTotalBudget"), `${budget.grandTotalBudget} ${currency}`],
            [t("invoicedTotal"), `${budget.invoicedTotal} ${currency}`],
            [t("paidTotal"), `${budget.paidTotal} ${currency}`],
            [t("outstandingTotal"), `${budget.outstandingTotal} ${currency}`],
          ]}
        />
      </div>
    </div>
  );
}

function BudgetCard({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="card">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, value, colorClass]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-500">{label}</dt>
            <dd className={colorClass}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
