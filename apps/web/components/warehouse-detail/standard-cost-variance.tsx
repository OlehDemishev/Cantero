"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/format-currency";
import { useWarehouseDetail } from "./context";
import type { StandardCostVarianceRow } from "./types";

/** Each material's actual unit value against its standard cost. */
export function StandardCostVariance() {
  const t = useTranslations("warehouses");
  const { warehouseId, currency, version } = useWarehouseDetail();
  const [standardCostVariance, setStandardCostVariance] = useState<
    StandardCostVarianceRow[] | null
  >(null);

  useEffect(() => {
    apiFetch<StandardCostVarianceRow[]>(
      `/materials/stock/standard-cost-variance?warehouseId=${warehouseId}`,
    ).then(setStandardCostVariance).catch(notifyApiError);
  }, [warehouseId, version]);

  return (
    <>
      {standardCostVariance && standardCostVariance.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">
            {t("standardCostVariance")}
          </h2>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("material")}</th>
                  <th scope="col" className="text-right">{t("standardCost")}</th>
                  <th scope="col" className="text-right">{t("unitValue")}</th>
                  <th scope="col" className="text-right">{t("variance")}</th>
                </tr>
              </thead>
              <tbody>
                {standardCostVariance.map((row) => (
                  <tr key={row.materialCatalogItemId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{row.materialName}</td>
                    <td className="text-right">
                      {formatCurrency(row.standardCost, currency, { fractionDigits: 4 })}
                    </td>
                    <td className="text-right">
                      {row.unitValue !== null ? `${formatCurrency(row.unitValue, currency, { fractionDigits: 4 })}` : "—"}
                    </td>
                    <td
                      className={`text-right font-medium ${
                        row.varianceAmount > 0
                          ? "text-danger-fg"
                          : row.varianceAmount < 0
                            ? "text-success-fg"
                            : ""
                      }`}
                    >
                      {row.varianceAmount > 0 ? "+" : ""}
                      {formatCurrency(row.varianceAmount, currency, { fractionDigits: 4 })}
                      {row.variancePercent !== null && (
                        <span className="ml-1 text-xs">
                          ({row.variancePercent > 0 ? "+" : ""}
                          {formatNumber(row.variancePercent, { fractionDigits: 1 })}%)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
