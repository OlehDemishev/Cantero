"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface UnitRate {
  unit: string;
  totalQuantityCompleted: number;
  totalLaborHours: number;
  hoursPerUnit: number | null;
  unitsPerHour: number | null;
}
interface CrewRow {
  crewName: string | null;
  projectCount: number;
  totalLaborHours: number;
  byUnit: UnitRate[];
}

export function ProductivityScorecardPanel() {
  const t = useTranslations("productivityScorecard");
  const tc = useTranslations("common");

  const [rows, setRows] = useState<CrewRow[] | null>(null);

  useEffect(() => {
    apiFetch<CrewRow[]>("/productivity-logs/crew-scorecard").then(setRows);
  }, []);

  if (rows && rows.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {rows === null ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.crewName ?? "unassigned"} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{row.crewName ?? t("unassignedCrew")}</span>
                <span className="text-xs text-gray-500">{t("projectCount", { count: row.projectCount })}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{t("totalHours", { hours: row.totalLaborHours })}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2">
                {row.byUnit.map((u) => (
                  <span key={u.unit} className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">{u.unit}</span>:{" "}
                    {u.hoursPerUnit !== null ? t("hoursPerUnit", { rate: u.hoursPerUnit.toFixed(3), unit: u.unit }) : "—"}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
