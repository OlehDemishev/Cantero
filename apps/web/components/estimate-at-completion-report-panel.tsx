"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface EacRow {
  projectId: string;
  projectName: string;
  contractValue: number;
  budgetedCost: number;
  actualCost: number;
  percentComplete: number;
  earnedValue: number;
  costPerformanceIndex: number | null;
  estimateAtCompletion: number;
  varianceAtCompletion: number;
  budgetedMarginPercent: number | null;
  projectedMarginPercent: number | null;
  marginErosionPercent: number | null;
}

export function EstimateAtCompletionReportPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [eac, setEac] = useState<EacRow[] | null>(null);

  useEffect(() => {
    apiFetch<EacRow[]>("/reports/estimate-at-completion").then(setEac);
  }, []);

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("estimateAtCompletion")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("estimateAtCompletionHint")}</p>
      {!eac ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : eac.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2">{t("project")}</th>
                <th className="text-right">{t("percentComplete")}</th>
                <th className="text-right">{t("costPerformanceIndex")}</th>
                <th className="text-right">{t("estimateAtCompletionShort")}</th>
                <th className="text-right">{t("varianceAtCompletion")}</th>
                <th className="text-right">{t("projectedMargin")}</th>
                <th className="text-right">{t("marginErosion")}</th>
              </tr>
            </thead>
            <tbody>
              {eac.map((row) => (
                <tr key={row.projectId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    <a href={`/projects/${row.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {row.projectName}
                    </a>
                  </td>
                  <td className="text-right tabular-nums">{row.percentComplete}%</td>
                  <td className="text-right tabular-nums">
                    {row.costPerformanceIndex === null ? "—" : row.costPerformanceIndex}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.estimateAtCompletion} {currency}
                  </td>
                  <td className={`text-right tabular-nums ${row.varianceAtCompletion < 0 ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>
                    {row.varianceAtCompletion} {currency}
                  </td>
                  <td className={`text-right tabular-nums ${(row.projectedMarginPercent ?? 0) < 0 ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>
                    {row.projectedMarginPercent === null ? "—" : `${row.projectedMarginPercent}%`}
                  </td>
                  <td className={`text-right tabular-nums ${(row.marginErosionPercent ?? 0) > 0 ? "text-error-700 dark:text-error-500" : "text-success-700 dark:text-success-500"}`}>
                    {row.marginErosionPercent === null ? "—" : `${row.marginErosionPercent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
