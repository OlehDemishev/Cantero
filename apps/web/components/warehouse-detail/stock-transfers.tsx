"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { Badge } from "@/components/ui/badge";
import { MaterialPicker } from "./material-picker";
import { useWarehouseDetail } from "./context";
import type { StockTransfer } from "./types";

const STOCK_TRANSFERS_PAGE_SIZE = 100;

/** Move stock to another warehouse at once, or send it in transit to be received there. */
export function StockTransfers() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { warehouseId, otherWarehouses, materials, version, busy, setBusy, refresh } = useWarehouseDetail();
  const [transfer, setTransfer] = useState({
    materialCatalogItemId: "",
    toWarehouseId: "",
    quantity: "1",
  });
  const [inTransitForm, setInTransitForm] = useState({
    materialCatalogItemId: "",
    toWarehouseId: "",
    quantity: "1",
  });
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[] | null>(
    null,
  );
  const [stockTransfersHasMore, setStockTransfersHasMore] = useState(false);
  const [stockTransfersLoadMoreBusy, setStockTransfersLoadMoreBusy] =
    useState(false);

  useEffect(() => {
    apiFetch<StockTransfer[]>(
      `/materials/stock-transfers?warehouseId=${warehouseId}`,
    ).then((page) => {
      setStockTransfers(page);
      setStockTransfersHasMore(page.length === STOCK_TRANSFERS_PAGE_SIZE);
    }).catch(notifyApiError);
  }, [warehouseId, version]);

  useEffect(() => {
    if (materials[0]) resetStateInEffect(() => setTransfer((tr) => ({ ...tr, materialCatalogItemId: materials[0].id })));
  }, [materials]);

  useEffect(() => {
    if (!transfer.toWarehouseId && otherWarehouses[0]) {
      resetStateInEffect(() =>
        setTransfer((tr) => ({ ...tr, toWarehouseId: otherWarehouses[0].id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherWarehouses[0]?.id]);

  async function loadMoreStockTransfers() {
    if (!stockTransfers || stockTransfers.length === 0) return;
    setStockTransfersLoadMoreBusy(true);
    try {
      const page = await apiFetch<StockTransfer[]>(
        `/materials/stock-transfers?warehouseId=${warehouseId}&cursor=${stockTransfers[stockTransfers.length - 1].id}`,
      );
      setStockTransfers([...stockTransfers, ...page]);
      setStockTransfersHasMore(page.length === STOCK_TRANSFERS_PAGE_SIZE);
    } finally {
      setStockTransfersLoadMoreBusy(false);
    }
  }

  async function recordTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transfer.toWarehouseId) return;
    setBusy(true);
    try {
      await apiFetch("/materials/stock/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: warehouseId,
          toWarehouseId: transfer.toWarehouseId,
          materialCatalogItemId: transfer.materialCatalogItemId,
          quantity: Number(transfer.quantity),
        }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function initiateStockTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!inTransitForm.toWarehouseId) return;
    setBusy(true);
    try {
      await apiFetch("/materials/stock-transfers", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: warehouseId,
          toWarehouseId: inTransitForm.toWarehouseId,
          materialCatalogItemId: inTransitForm.materialCatalogItemId,
          quantity: Number(inTransitForm.quantity),
        }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function receiveStockTransfer(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-transfers/${id}/receive`, {
        method: "POST",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelStockTransfer(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-transfers/${id}/cancel`, {
        method: "POST",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {otherWarehouses.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
            {t("transferStock")}
          </h2>
          <form
            onSubmit={recordTransfer}
            className="flex flex-wrap items-end gap-2"
          >
            <MaterialPicker
              id="transfer-material"
              materials={materials}
              value={transfer.materialCatalogItemId}
              onChange={(id) =>
                setTransfer((tr) => ({ ...tr, materialCatalogItemId: id }))
              }
            />
            <span className="pb-2.5 text-sm text-fg-subtle">
              →
            </span>
            <select aria-label={ta("destinationWarehouse")}
              className="input w-auto"
              value={transfer.toWarehouseId}
              onChange={(e) =>
                setTransfer((tr) => ({ ...tr, toWarehouseId: e.target.value }))
              }
            >
              {otherWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input aria-label={t("movementQuantity")}
              type="number"
              step="0.01"
              className="input w-24"
              value={transfer.quantity}
              onChange={(e) =>
                setTransfer((tr) => ({ ...tr, quantity: e.target.value }))
              }
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("transfer")}
            </button>
          </form>

          <h2 className="mb-1 mt-8 text-sm font-semibold text-fg-muted">
            {t("inTransitTransfer")}
          </h2>
          <p className="mb-3 text-xs text-fg-subtle">
            {t("inTransitTransferHint")}
          </p>
          <form
            onSubmit={initiateStockTransfer}
            className="flex flex-wrap items-end gap-2"
          >
            <MaterialPicker
              id="in-transit-material"
              materials={materials}
              value={inTransitForm.materialCatalogItemId}
              onChange={(id) =>
                setInTransitForm((f) => ({ ...f, materialCatalogItemId: id }))
              }
            />
            <span className="pb-2.5 text-sm text-fg-subtle">
              →
            </span>
            <select aria-label={ta("destinationWarehouse")}
              className="input w-auto"
              value={inTransitForm.toWarehouseId}
              onChange={(e) =>
                setInTransitForm((f) => ({
                  ...f,
                  toWarehouseId: e.target.value,
                }))
              }
            >
              {otherWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input aria-label={t("movementQuantity")}
              type="number"
              step="0.01"
              className="input w-24"
              value={inTransitForm.quantity}
              onChange={(e) =>
                setInTransitForm((f) => ({ ...f, quantity: e.target.value }))
              }
            />
            <button type="submit" disabled={busy} className="btn-secondary">
              {t("initiateTransfer")}
            </button>
          </form>
        </>
      )}

      {stockTransfers && stockTransfers.length > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th scope="col" className="py-2">{t("material")}</th>
                  <th scope="col">{t("route")}</th>
                  <th scope="col">{t("quantity")}</th>
                  <th scope="col">{tc("status")}</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {stockTransfers.map((tr) => (
                  <tr
                    key={tr.id}
                    className="border-b border-gray-100 dark:border-gray-700"
                  >
                    <td className="py-2">{tr.materialCatalogItem.name}</td>
                    <td className="text-xs text-fg-subtle">
                      {tr.fromWarehouse.name} → {tr.toWarehouse.name}
                    </td>
                    <td>
                      {tr.quantity} {tr.materialCatalogItem.unit}
                    </td>
                    <td>
                      <Badge tone={tr.status === "in_transit" ? "brand" : tr.status === "received" ? "success" : "neutral"}>
                        {t(`transferStatus_${tr.status}`)}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {tr.status === "in_transit" &&
                        tr.toWarehouse.id === warehouseId && (
                          <button
                            onClick={() => receiveStockTransfer(tr.id)}
                            disabled={busy}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            {t("receiveTransfer")}
                          </button>
                        )}
                      {tr.status === "in_transit" &&
                        tr.fromWarehouse.id === warehouseId && (
                          <button
                            onClick={() => cancelStockTransfer(tr.id)}
                            disabled={busy}
                            className="ml-1.5 text-xs text-fg-subtle hover:text-danger-fg"
                          >
                            {tc("cancel")}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockTransfersHasMore && (
              <button
                onClick={loadMoreStockTransfers}
                disabled={stockTransfersLoadMoreBusy}
                className="btn-secondary mt-3 px-2.5 py-1 text-xs"
              >
                {tc("loadMore")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
