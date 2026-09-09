"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

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
  const [wip, setWip] = useState<WipReport | null>(null);
  const [wipExporting, setWipExporting] = useState(false);

  useEffect(() => {
    apiFetch<WipReport>("/reports/wip-report").then(setWip);
  }, []);

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
          <h2 className="text-sm font-semibold text-gray-700">{t("wipReport")}</h2>
          <p className="mt-1 text-xs text-gray-500">{t("wipReportHint")}</p>
        </div>
        <button onClick={downloadWipPdf} disabled={wipExporting} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {wipExporting ? tc("loading") : t("downloadWipPdf")}
        </button>
      </div>
      {!wip ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : wip.rows.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noProjects")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
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
                <tr key={row.projectId} className="border-b border-gray-100">
                  <td className="py-2">
                    <a href={`/projects/${row.projectId}`} className="text-brand-700 hover:underline">
                      {row.projectName}
                    </a>
                  </td>
                  <td className="text-right tabular-nums">
                    {row.contractValue} {currency}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.costsIncurredToDate} {currency}
                  </td>
                  <td className="text-right tabular-nums">{row.percentComplete}%</td>
                  <td className="text-right tabular-nums">
                    {row.earnedRevenue} {currency}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.billedToDate} {currency}
                  </td>
                  <td className="text-right tabular-nums">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "overbilled"
                          ? "bg-warning-50 text-warning-700"
                          : row.status === "underbilled"
                            ? "bg-brand-50 text-brand-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {row.overUnderBilling} {currency}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2">{t("total")}</td>
                <td className="pt-2 text-right tabular-nums">
                  {wip.totals.contractValue} {currency}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {wip.totals.costsIncurredToDate} {currency}
                </td>
                <td className="pt-2 text-right"></td>
                <td className="pt-2 text-right tabular-nums">
                  {wip.totals.earnedRevenue} {currency}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {wip.totals.billedToDate} {currency}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {wip.totals.overUnderBilling} {currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
