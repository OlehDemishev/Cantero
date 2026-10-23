"use client";

import { useTranslations } from "next-intl";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
  const { data: turnover = null, error: turnoverError, reload: reloadTurnover } = useApi<TurnoverRow[]>("/reports/warehouse-turnover");

  return (
    <>
      <h2 className="mb-3 mt-10 text-sm font-semibold text-fg-muted">{t("warehouseTurnover")}</h2>
      {!turnover ? (
        turnoverError ? <ErrorState error={turnoverError} onRetry={reloadTurnover} compact /> : <Skeleton lines={3} />
      ) : turnover.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noTurnoverData")}</p>
      ) : (
        <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("material")}</th>
                <th scope="col" className="text-right">{t("onHand")}</th>
                <th scope="col" className="text-right">{t("consumed")}</th>
                <th scope="col" className="text-right">{t("turnoverRatio")}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {turnover.map((row) => (
                <tr key={row.materialId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    {row.name} <span className="text-fg-subtle">({row.code})</span>
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
                      <Badge tone="warning">
                        {t("slowMoving")}
                      </Badge>
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
