"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

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

  const [report, setReport] = useState<CarbonReport | null>(null);

  useEffect(() => {
    apiFetch<CarbonReport>(`/sustainability/carbon-report?projectId=${projectId}`).then(setReport);
  }, [projectId]);

  if (!report || report.rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("carbonReport")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("carbonReportHint")}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-gray-500">{t("totalCarbon")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{report.totalKgCo2e} kg CO2e</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("greenCertifiedPercent")}</div>
          <div className="mt-1 text-lg font-semibold text-success-700">{report.greenCertifiedPercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("untrackedMaterials")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{report.untrackedMaterialCount}</div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2">{t("material")}</th>
            <th className="text-right">{t("quantityUsed")}</th>
            <th className="text-right">{t("carbonFootprint")}</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.materialCatalogItemId} className="border-b border-gray-100">
              <td className="py-2">
                {r.name}
                {r.greenCertified && <span className="ml-1 rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] text-success-700">{t("greenCertified")}</span>}
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
  );
}
