"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-currency";

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

  const canSee = useCan()("site.manage");
  const { data: rows = null, error, reload } = useApi<CrewRow[]>(canSee ? "/productivity-logs/crew-scorecard" : null);

  if (!canSee || (rows && rows.length === 0)) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {rows === null ? (
        error ? <ErrorState error={error} onRetry={reload} compact /> : <Skeleton lines={3} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.crewName ?? "unassigned"} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">{row.crewName ?? t("unassignedCrew")}</span>
                <span className="text-xs text-fg-subtle">{t("projectCount", { count: row.projectCount })}</span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">{t("totalHours", { hours: row.totalLaborHours })}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                {row.byUnit.map((u) => (
                  <span key={u.unit} className="text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-fg">{u.unit}</span>:{" "}
                    {u.hoursPerUnit !== null ? t("hoursPerUnit", { rate: formatNumber(u.hoursPerUnit, { fractionDigits: 3 }), unit: u.unit }) : "—"}
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
