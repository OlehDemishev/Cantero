"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface CostSummary {
  activeEnrollmentCount: number;
  totalMonthlyEmployerCost: number;
  totalMonthlyEmployeeCost: number;
}

export function BenefitsCostSummaryPanel() {
  const t = useTranslations("benefits");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";
  const [summary, setSummary] = useState<CostSummary | null>(null);

  useEffect(() => {
    apiFetch<CostSummary>("/benefits/cost-summary").then(setSummary);
  }, []);

  if (!summary || summary.activeEnrollmentCount === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("costSummaryTitle")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("costSummaryHint")}</p>
      <div className="card grid grid-cols-3 gap-3 max-w-lg">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("activeEnrollments")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{summary.activeEnrollmentCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalEmployerCost")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
            {summary.totalMonthlyEmployerCost} {currency}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalEmployeeCost")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
            {summary.totalMonthlyEmployeeCost} {currency}
          </div>
        </div>
      </div>
    </div>
  );
}
