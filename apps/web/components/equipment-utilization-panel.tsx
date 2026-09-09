"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface UtilizationEntry {
  id: string;
  name: string;
  category: string;
  status: string;
  hoursInUse: number;
  utilizationPercent: number;
}

export function EquipmentUtilizationPanel() {
  const t = useTranslations("equipmentUtilization");
  const [entries, setEntries] = useState<UtilizationEntry[] | null>(null);

  useEffect(() => {
    apiFetch<UtilizationEntry[]>("/reports/equipment-utilization").then(setEntries);
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("description")}</p>
      <div className="card">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-1.5">{t("equipment")}</th>
              <th>{t("category")}</th>
              <th>{t("hoursInUse")}</th>
              <th>{t("utilization")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5">{e.name}</td>
                <td className="text-xs text-gray-500 dark:text-gray-400">{e.category}</td>
                <td>{e.hoursInUse}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${
                          e.utilizationPercent >= 60 ? "bg-success-500" : e.utilizationPercent >= 25 ? "bg-amber-500" : "bg-error-500"
                        }`}
                        style={{ width: `${Math.min(100, e.utilizationPercent)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{e.utilizationPercent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
