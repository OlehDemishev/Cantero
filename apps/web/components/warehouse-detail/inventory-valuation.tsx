"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format-currency";
import { useWarehouseDetail } from "./context";
import type { InventoryValuation as Valuation } from "./types";

/** The stock's value by the company's costing method (FIFO or weighted average). */
export function InventoryValuation() {
  const t = useTranslations("warehouses");
  const { warehouseId, currency, version } = useWarehouseDetail();
  const [valuation, setValuation] = useState<Valuation | null>(null);

  useEffect(() => {
    apiFetch<Valuation>(
      `/materials/stock/valuation?warehouseId=${warehouseId}`,
    ).then(setValuation).catch(notifyApiError);
  }, [warehouseId, version]);

  return (
    <>
      {valuation && valuation.rows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-fg-muted">
            {t("inventoryValuation")}
          </h2>
          <p className="mb-3 text-xs text-fg-subtle">
            {t("inventoryValuationHint", {
              method: t(`costingMethod_${valuation.method}`),
            })}
          </p>
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("material")}</th>
                  <th scope="col">{t("quantity")}</th>
                  <th scope="col" className="text-right">{t("unitValue")}</th>
                  <th scope="col" className="text-right">{t("totalValue")}</th>
                </tr>
              </thead>
              <tbody>
                {valuation.rows.map((row) => (
                  <tr
                    key={row.materialCatalogItemId}
                    className="border-b border-gray-100 dark:border-gray-700"
                  >
                    <td className="py-2">{row.materialName}</td>
                    <td>
                      {row.quantity} {row.unit}
                    </td>
                    <td className="text-right">
                      {row.unitValue !== null
                        ? `${formatCurrency(row.unitValue, currency, { fractionDigits: 4 })}`
                        : "—"}
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(row.totalValue, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-2" colSpan={3}>
                    {t("total")}
                  </td>
                  <td className="pt-2 text-right">
                    {formatCurrency(valuation.totalValue, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
