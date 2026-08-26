"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface RateItemAccuracy {
  rateCatalogItemId: string;
  code: string;
  name: string;
  unit: string;
  laborSampleSize: number;
  estimatedLaborHours: number;
  actualLaborHours: number;
  laborDeviationPercent: number | null;
  materialSampleSize: number;
  estimatedMaterialsCost: number;
  actualMaterialsCost: number;
  materialsDeviationPercent: number | null;
}

function DeviationBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-xs text-gray-400">—</span>;
  const overrun = percent > 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        overrun ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-700"
      }`}
    >
      {overrun ? "+" : ""}
      {percent}%
    </span>
  );
}

/** Compares each rate item's estimated labor hours/material norms against the company's own
 * recorded actuals (TimeEntry, StockMovement) — purely historical, no external AI involved. */
export function EstimateAccuracyPanel() {
  const t = useTranslations("estimateAccuracy");
  const [rows, setRows] = useState<RateItemAccuracy[] | null>(null);

  useEffect(() => {
    apiFetch<RateItemAccuracy[]>("/estimate-accuracy/rate-items").then(setRows);
  }, []);

  if (rows && rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {!rows ? (
        <p className="text-sm text-gray-400">…</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("rateItem")}</th>
              <th>{t("labor")}</th>
              <th>{t("materials")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rateCatalogItemId} className="border-b border-gray-100">
                <td className="py-2">
                  <span className="font-mono text-xs text-gray-400">{row.code}</span> {row.name}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <DeviationBadge percent={row.laborDeviationPercent} />
                    {row.laborSampleSize > 0 && (
                      <span className="text-xs text-gray-400">{t("sampleSize", { count: row.laborSampleSize })}</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <DeviationBadge percent={row.materialsDeviationPercent} />
                    {row.materialSampleSize > 0 && (
                      <span className="text-xs text-gray-400">{t("sampleSize", { count: row.materialSampleSize })}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
