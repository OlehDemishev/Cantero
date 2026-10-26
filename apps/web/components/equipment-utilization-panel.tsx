"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { PanelErrorState } from "@/components/ui/error-state";

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
  const { data: entries = null, error: entriesError, reload: reloadEntries } = useApi<UtilizationEntry[]>("/reports/equipment-utilization");

  if (entriesError && !entries) return <PanelErrorState title={t("title")} error={entriesError} onRetry={reloadEntries} />;
  if (!entries || entries.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("description")}</p>
      <div className="card">
        <div tabIndex={0} className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
              <th scope="col" className="py-1.5">{t("equipment")}</th>
              <th scope="col">{t("category")}</th>
              <th scope="col">{t("hoursInUse")}</th>
              <th scope="col">{t("utilization")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5">{e.name}</td>
                <td className="text-xs text-fg-subtle">{e.category}</td>
                <td>{e.hoursInUse}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${
                          e.utilizationPercent >= 60 ? "bg-success-500" : e.utilizationPercent >= 25 ? "bg-warning-500" : "bg-error-500"
                        }`}
                        style={{ width: `${Math.min(100, e.utilizationPercent)}%` }}
                      />
                    </div>
                    <span className="text-xs text-fg-subtle">{e.utilizationPercent}%</span>
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
