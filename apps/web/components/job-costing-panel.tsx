"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

interface JobCostRow {
  code: string;
  name: string;
  estimated: number;
  committed: number;
  actual: number;
  variance: number;
}
interface JobCostReport {
  rows: JobCostRow[];
  totals: { estimated: number; committed: number; actual: number; variance: number };
}

export function JobCostingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("jobCosting");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [report, setReport] = useState<JobCostReport | null>(null);

  useEffect(() => {
    apiFetch<JobCostReport>(`/job-costing?projectId=${projectId}`).then(setReport);
  }, [projectId]);

  if (!report || report.rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">{t("costCode")}</th>
              <th className="text-right">{t("estimated")}</th>
              <th className="text-right">{t("committed")}</th>
              <th className="text-right">{t("actual")}</th>
              <th className="text-right">{t("variance")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.code} className="border-b border-gray-100 dark:border-gray-800/60">
                <td className="py-1.5">
                  <span className="font-mono text-xs text-gray-400">{row.code}</span> {row.name}
                </td>
                <td className="text-right">
                  {row.estimated.toFixed(2)} {currency}
                </td>
                <td className="text-right">
                  {row.committed.toFixed(2)} {currency}
                </td>
                <td className="text-right">
                  {row.actual.toFixed(2)} {currency}
                </td>
                <td className={`text-right font-medium ${row.variance < 0 ? "text-error-600" : "text-success-700"}`}>
                  {row.variance.toFixed(2)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-2">{t("total")}</td>
              <td className="pt-2 text-right">
                {report.totals.estimated.toFixed(2)} {currency}
              </td>
              <td className="pt-2 text-right">
                {report.totals.committed.toFixed(2)} {currency}
              </td>
              <td className="pt-2 text-right">
                {report.totals.actual.toFixed(2)} {currency}
              </td>
              <td className={`pt-2 text-right ${report.totals.variance < 0 ? "text-error-600" : "text-success-700"}`}>
                {report.totals.variance.toFixed(2)} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
