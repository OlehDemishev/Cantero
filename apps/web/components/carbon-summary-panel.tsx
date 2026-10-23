"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { useCan } from "@/lib/permissions";
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
interface CarbonSummary {
  rows: CarbonRow[];
  totalKgCo2e: number;
  untrackedMaterialCount: number;
  greenCertifiedPercent: number;
}

/** Company-wide version of the per-project carbon report — same computation, no projectId filter. */
export function CarbonSummaryPanel() {
  const t = useTranslations("sustainability");

  const canSee = useCan()("site.manage");
  const { data: summary = null, error, reload } = useApi<CarbonSummary>(canSee ? "/sustainability/carbon-summary" : null);

  if (!canSee) return null;
  if (error && !summary) return <PanelErrorState title={t("carbonSummary")} error={error} onRetry={reload} />;
  if (!summary || summary.rows.length === 0) return null;

  const topMaterials = summary.rows.filter((r) => r.kgCo2e !== null).slice(0, 10);

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("carbonSummary")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("carbonSummaryHint")}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("totalCarbon")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">{summary.totalKgCo2e} kg CO2e</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("greenCertifiedPercent")}</div>
          <div className="mt-1 text-lg font-semibold text-success-fg">{summary.greenCertifiedPercent}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-fg-subtle">{t("untrackedMaterials")}</div>
          <div className="mt-1 text-lg font-semibold text-fg">{summary.untrackedMaterialCount}</div>
        </div>
      </div>

      {topMaterials.length > 0 && (
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
            {topMaterials.map((r) => (
              <tr key={r.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">
                  {r.name}
                  {r.greenCertified && <Badge tone="success" size="sm" className="ml-1">{t("greenCertified")}</Badge>}
                </td>
                <td className="text-right">
                  {r.quantity} {r.unit}
                </td>
                <td className="text-right">{r.kgCo2e} kg CO2e</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
