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
interface CarbonSummary {
  rows: CarbonRow[];
  totalKgCo2e: number;
  untrackedMaterialCount: number;
  greenCertifiedPercent: number;
}

/** Company-wide version of the per-project carbon report — same computation, no projectId filter. */
export function CarbonSummaryPanel() {
  const t = useTranslations("sustainability");

  const [summary, setSummary] = useState<CarbonSummary | null>(null);

  useEffect(() => {
    apiFetch<CarbonSummary>("/sustainability/carbon-summary").then(setSummary);
  }, []);

  if (!summary || summary.rows.length === 0) return null;

  const topMaterials = summary.rows.filter((r) => r.kgCo2e !== null).slice(0, 10);

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("carbonSummary")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("carbonSummaryHint")}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-gray-500">{t("totalCarbon")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{summary.totalKgCo2e} kg CO2e</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("greenCertifiedPercent")}</div>
          <div className="mt-1 text-lg font-semibold text-success-700">{summary.greenCertifiedPercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">{t("untrackedMaterials")}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{summary.untrackedMaterialCount}</div>
        </div>
      </div>

      {topMaterials.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("material")}</th>
              <th className="text-right">{t("quantityUsed")}</th>
              <th className="text-right">{t("carbonFootprint")}</th>
            </tr>
          </thead>
          <tbody>
            {topMaterials.map((r) => (
              <tr key={r.materialCatalogItemId} className="border-b border-gray-100">
                <td className="py-2">
                  {r.name}
                  {r.greenCertified && <span className="ml-1 rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] text-success-700">{t("greenCertified")}</span>}
                </td>
                <td className="text-right">
                  {r.quantity} {r.unit}
                </td>
                <td className="text-right">{r.kgCo2e} kg CO2e</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
