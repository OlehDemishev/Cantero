"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format-currency";
import { Badge } from "@/components/ui/badge";

interface WipRow {
  projectId: string;
  projectName: string;
  contractValue: number;
  totalEstimatedCost: number;
  costsIncurredToDate: number;
  percentComplete: number;
  earnedRevenue: number;
  billedToDate: number;
  overUnderBilling: number;
  status: "overbilled" | "underbilled" | "even";
}
interface WipReport {
  rows: WipRow[];
  totals: {
    contractValue: number;
    costsIncurredToDate: number;
    earnedRevenue: number;
    billedToDate: number;
    overUnderBilling: number;
  };
}

export function WipReportPanel({ currency }: { currency: string }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const { data: wip = null, error: wipError, reload: reloadWip } = useApi<WipReport>("/reports/wip-report");
  const [wipExporting, setWipExporting] = useState(false);

  async function downloadWipPdf() {
    setWipExporting(true);
    try {
      const blob = await apiFetch<Blob>("/reports/wip-report/pdf");
      downloadBlob(blob, "wip-report.pdf");
    } finally {
      setWipExporting(false);
    }
  }

  return (
    <>
      <div className="mb-3 mt-10 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-fg-muted">{t("wipReport")}</h2>
          <p className="mt-1 text-xs text-fg-subtle">{t("wipReportHint")}</p>
        </div>
        <button onClick={downloadWipPdf} disabled={wipExporting} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {wipExporting ? tc("loading") : t("downloadWipPdf")}
        </button>
      </div>
      {!wip ? (
        wipError ? <ErrorState error={wipError} onRetry={reloadWip} compact /> : <Skeleton lines={3} />
      ) : wip.rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th className="py-2">{t("project")}</th>
                <th className="text-right">{t("contractValue")}</th>
                <th className="text-right">{t("costsIncurredToDate")}</th>
                <th className="text-right">{t("percentComplete")}</th>
                <th className="text-right">{t("earnedRevenue")}</th>
                <th className="text-right">{t("billedToDate")}</th>
                <th className="text-right">{t("overUnderBilling")}</th>
              </tr>
            </thead>
            <tbody>
              {wip.rows.map((row) => (
                <tr key={row.projectId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    <a href={`/projects/${row.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                      {row.projectName}
                    </a>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatCurrency(row.contractValue, currency)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatCurrency(row.costsIncurredToDate, currency)}
                  </td>
                  <td className="text-right tabular-nums">{row.percentComplete}%</td>
                  <td className="text-right tabular-nums">
                    {formatCurrency(row.earnedRevenue, currency)}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatCurrency(row.billedToDate, currency)}
                  </td>
                  <td className="text-right tabular-nums">
                    <Badge tone={row.status === "overbilled" ? "warning" : row.status === "underbilled" ? "brand" : "neutral"}>
                      {formatCurrency(row.overUnderBilling, currency)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2">{t("total")}</td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(wip.totals.contractValue, currency)}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(wip.totals.costsIncurredToDate, currency)}
                </td>
                <td className="pt-2 text-right"></td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(wip.totals.earnedRevenue, currency)}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(wip.totals.billedToDate, currency)}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {formatCurrency(wip.totals.overUnderBilling, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
