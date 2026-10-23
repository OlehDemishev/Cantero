"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useWarehouseDetail } from "./context";
import type { StockMovement } from "./types";

const MOVEMENTS_PAGE_SIZE = 100;

/** Every movement in and out of the warehouse, newest first, a page at a time. */
export function MovementHistory() {
  const t = useTranslations("warehouses");
  const { warehouseId, version } = useWarehouseDetail();
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [movementsLoadMoreBusy, setMovementsLoadMoreBusy] = useState(false);

  useEffect(() => {
    apiFetch<StockMovement[]>(
      `/materials/stock/movements?warehouseId=${warehouseId}`,
    ).then((page) => {
      setMovements(page);
      setMovementsHasMore(page.length === MOVEMENTS_PAGE_SIZE);
    }).catch(notifyApiError);
  }, [warehouseId, version]);

  async function loadMoreMovements() {
    if (!movements || movements.length === 0) return;
    setMovementsLoadMoreBusy(true);
    try {
      const page = await apiFetch<StockMovement[]>(
        `/materials/stock/movements?warehouseId=${warehouseId}&cursor=${movements[movements.length - 1].id}`,
      );
      setMovements([...movements, ...page]);
      setMovementsHasMore(page.length === MOVEMENTS_PAGE_SIZE);
    } finally {
      setMovementsLoadMoreBusy(false);
    }
  }

  return (
    <>
      {movements && movements.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg-muted">
            {t("movementHistory")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("material")}</th>
                  <th scope="col">{t("movementType")}</th>
                  <th scope="col">{t("movementQuantity")}</th>
                  <th scope="col">{t("movementProject")}</th>
                  <th scope="col">{t("movementDate")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mv) => (
                  <tr
                    key={mv.id}
                    className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <td className="py-1.5">
                      {mv.materialCatalogItem.name} (
                      {mv.materialCatalogItem.code})
                    </td>
                    <td>{t(mv.type)}</td>
                    <td>
                      {mv.quantity} {mv.materialCatalogItem.unit}
                    </td>
                    <td>
                      {mv.project ? (
                        <Link
                          href={`/projects/${mv.project.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {mv.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDate(new Date(mv.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movementsHasMore && (
            <button
              onClick={loadMoreMovements}
              disabled={movementsLoadMoreBusy}
              className="btn-secondary mt-3 px-2.5 py-1 text-xs"
            >
              {t("loadMoreMovements")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
