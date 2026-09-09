"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface TurnoverRow {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  onHand: number;
  consumed: number;
  turnoverRatio: number | null;
  slowMoving: boolean;
}

export function WarehouseTurnoverReportPanel() {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const [turnover, setTurnover] = useState<TurnoverRow[] | null>(null);

  useEffect(() => {
    apiFetch<TurnoverRow[]>("/reports/warehouse-turnover").then(setTurnover);
  }, []);

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("warehouseTurnover")}</h2>
      {!turnover ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : turnover.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noTurnoverData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">{t("material")}</th>
                <th className="text-right">{t("onHand")}</th>
                <th className="text-right">{t("consumed")}</th>
                <th className="text-right">{t("turnoverRatio")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {turnover.map((row) => (
                <tr key={row.materialId} className="border-b border-gray-100">
                  <td className="py-2">
                    {row.name} <span className="text-gray-400">({row.code})</span>
                  </td>
                  <td className="text-right">
                    {row.onHand} {row.unit}
                  </td>
                  <td className="text-right">
                    {row.consumed} {row.unit}
                  </td>
                  <td className="text-right">{row.turnoverRatio ?? "—"}</td>
                  <td className="text-right">
                    {row.slowMoving && (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                        {t("slowMoving")}
                      </span>
                    )}
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
