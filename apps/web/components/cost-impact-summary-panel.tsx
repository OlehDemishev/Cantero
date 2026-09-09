"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface CostImpactRow {
  type: "rfi" | "punch_list";
  id: string;
  label: string;
  estimatedCostImpact: number | null;
  confirmedAmount: number | null;
  bestAmount: number | null;
}
interface CostImpactSummary {
  rows: CostImpactRow[];
  totalEstimated: number;
  totalConfirmed: number;
  unconfirmedCount: number;
}

export function CostImpactSummaryPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("costImpact");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [summary, setSummary] = useState<CostImpactSummary | null>(null);

  useEffect(() => {
    apiFetch<CostImpactSummary>(`/rfis/cost-impact-summary?projectId=${projectId}`).then(setSummary);
  }, [projectId]);

  if (!summary || summary.rows.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint", { count: summary.unconfirmedCount })}</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-2">{t("source")}</th>
              <th>{t("item")}</th>
              <th className="text-right">{t("amount")}</th>
              <th className="text-right">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={`${row.type}-${row.id}`} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{t(row.type)}</td>
                <td>{row.label}</td>
                <td className="text-right tabular-nums">
                  {row.bestAmount} {currency}
                </td>
                <td className="text-right">
                  {row.confirmedAmount !== null ? (
                    <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-500">{t("confirmed")}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t("estimated")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-2" colSpan={2}>
                {t("total")}
              </td>
              <td className="pt-2 text-right">
                {t("estimated")}: {summary.totalEstimated} {currency}
              </td>
              <td className="pt-2 text-right">
                {t("confirmed")}: {summary.totalConfirmed} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
