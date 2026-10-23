"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format-currency";

interface ProjectMargin {
  projectId: string;
  projectName: string;
  budgetTotal: number;
  invoicedTotal: number;
  paidTotal: number;
  actualCost: number;
  margin: number;
  marginPercent: number | null;
}

export function ProjectMarginsReportPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [margins, setMargins] = useState<ProjectMargin[] | null>(null);

  useEffect(() => {
    apiFetch<ProjectMargin[]>("/reports/project-margins").then(setMargins);
  }, []);

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("projectMargins")}</h2>
      {!margins ? (
        <p className="text-fg-subtle">{tc("loading")}</p>
      ) : margins.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th className="py-2">{t("project")}</th>
                <th className="text-right">{t("budget")}</th>
                <th className="text-right">{t("invoiced")}</th>
                <th className="text-right">{t("actualCost")}</th>
                <th className="text-right">{t("margin")}</th>
                <th className="text-right">{t("marginPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {margins.map((m) => (
                <tr key={m.projectId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    <a href={`/projects/${m.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {m.projectName}
                    </a>
                  </td>
                  <td className="text-right">
                    {formatCurrency(m.budgetTotal, currency)}
                  </td>
                  <td className="text-right">
                    {formatCurrency(m.invoicedTotal, currency)}
                  </td>
                  <td className="text-right">
                    {formatCurrency(m.actualCost, currency)}
                  </td>
                  <td className={`text-right ${m.margin < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                    {formatCurrency(m.margin, currency)}
                  </td>
                  <td className={`text-right ${m.margin < 0 ? "text-danger-fg" : "text-success-fg"}`}>
                    {m.marginPercent === null ? "—" : `${m.marginPercent}%`}
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
