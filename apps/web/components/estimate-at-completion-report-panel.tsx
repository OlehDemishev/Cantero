"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format-currency";

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
  const { data: eac = null, error: eacError, reload: reloadEac } = useApi<EacRow[]>("/reports/estimate-at-completion");

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-fg-muted">{t("estimateAtCompletion")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("estimateAtCompletionHint")}</p>
      {!eac ? (
        eacError ? <ErrorState error={eacError} onRetry={reloadEac} compact /> : <Skeleton lines={3} />
      ) : eac.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("project")}</th>
                <th scope="col" className="text-right">{t("percentComplete")}</th>
                <th scope="col" className="text-right">{t("costPerformanceIndex")}</th>
                <th scope="col" className="text-right">{t("estimateAtCompletionShort")}</th>
                <th scope="col" className="text-right">{t("varianceAtCompletion")}</th>
                <th scope="col" className="text-right">{t("projectedMargin")}</th>
                <th scope="col" className="text-right">{t("marginErosion")}</th>
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
                    {formatCurrency(row.estimateAtCompletion, currency)}
                  </td>
                  <td className={`text-right tabular-nums ${row.varianceAtCompletion < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                    {formatCurrency(row.varianceAtCompletion, currency)}
                  </td>
                  <td className={`text-right tabular-nums ${(row.projectedMarginPercent ?? 0) < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                    {row.projectedMarginPercent === null ? "—" : `${row.projectedMarginPercent}%`}
                  </td>
                  <td className={`text-right tabular-nums ${(row.marginErosionPercent ?? 0) > 0 ? "text-danger-fg" : "text-success-fg"}`}>
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
