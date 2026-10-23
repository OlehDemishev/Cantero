"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { PanelErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";

interface CarbonRow {
  materialCatalogItemId: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  kgCo2e: number | null;
  greenCertified: boolean;
}
interface CarbonReport {
  rows: CarbonRow[];
  totalKgCo2e: number;
  untrackedMaterialCount: number;
  greenCertifiedPercent: number;
}

export function CarbonReportPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("sustainability");

  const { data: report = null, error: reportError, reload: reloadReport } = useApi<CarbonReport>(`/sustainability/carbon-report?projectId=${projectId}`);

  if (reportError && !report) return <PanelErrorState title={t("carbonReport")} error={reportError} onRetry={reloadReport} className="mt-8" />;
  if (!report || report.rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("carbonReport")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("carbonReportHint")}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("totalCarbon")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">{report.totalKgCo2e} kg CO2e</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("greenCertifiedPercent")}</div>
          <div className="mt-1 text-lg font-semibold text-success-fg">{report.greenCertifiedPercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("untrackedMaterials")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">{report.untrackedMaterialCount}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
            <th className="py-2">{t("material")}</th>
            <th className="text-right">{t("quantityUsed")}</th>
            <th className="text-right">{t("carbonFootprint")}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2">
                {r.name}
                {r.greenCertified && <Badge tone="success" size="sm" className="ml-1">{t("greenCertified")}</Badge>}
              </td>
              <td className="text-right">
                {r.quantity} {r.unit}
              </td>
              <td className="text-right">{r.kgCo2e !== null ? `${r.kgCo2e} kg CO2e` : t("noFootprintData")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
