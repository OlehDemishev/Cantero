"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { Badge } from "@/components/ui/badge";
import { MaterialPicker } from "./material-picker";
import { useWarehouseDetail } from "./context";
import { SUPPLIER_RETURN_REASONS, type Supplier, type SupplierReturn, type SupplierReturnPO } from "./types";

/** Goods sent back to a supplier against a purchase order: draft, send, confirm. */
export function SupplierReturns() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { warehouseId, materials, version, busy, setBusy, refresh } = useWarehouseDetail();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierReturnPOs, setSupplierReturnPOs] = useState<SupplierReturnPO[]>([]);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[] | null>(null);
  const [supplierReturnForm, setSupplierReturnForm] = useState({
    supplierId: "",
    purchaseOrderId: "",
    reason: "defective" as (typeof SUPPLIER_RETURN_REASONS)[number],
    notes: "",
  });
  const [supplierReturnLines, setSupplierReturnLines] = useState<
    { materialCatalogItemId: string; quantity: string }[]
  >([{ materialCatalogItemId: "", quantity: "1" }]);

  useEffect(() => {
    apiFetch<SupplierReturn[]>(
      `/materials/supplier-returns?warehouseId=${warehouseId}`,
    ).then(setSupplierReturns).catch(notifyApiError);
  }, [warehouseId, version]);

  useEffect(() => {
    apiFetch<Supplier[]>("/materials/suppliers").then((s) => {
      setSuppliers(s);
      if (s[0]) setSupplierReturnForm((f) => ({ ...f, supplierId: s[0].id }));
    }).catch(notifyApiError);
  }, [warehouseId]);

  useEffect(() => {
    if (materials[0]) resetStateInEffect(() => setSupplierReturnLines([{ materialCatalogItemId: materials[0].id, quantity: "1" }]));
  }, [materials]);

  useEffect(() => {
    if (supplierReturnForm.supplierId) {
      apiFetch<SupplierReturnPO[]>(
        `/materials/purchase-orders?supplierId=${supplierReturnForm.supplierId}`,
      ).then((pos) => {
        setSupplierReturnPOs(pos);
        setSupplierReturnForm((f) => ({ ...f, purchaseOrderId: pos[0]?.id ?? "" }));
      }).catch(notifyApiError);
    } else {
      resetStateInEffect(() => setSupplierReturnPOs([]));
    }
  }, [supplierReturnForm.supplierId]);

  function addSupplierReturnLine() {
    if (materials.length === 0) return;
    setSupplierReturnLines((l) => [...l, { materialCatalogItemId: materials[0].id, quantity: "1" }]);
  }

  async function createSupplierReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierReturnForm.purchaseOrderId || supplierReturnLines.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/materials/supplier-returns", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierReturnForm.supplierId,
          purchaseOrderId: supplierReturnForm.purchaseOrderId,
          warehouseId,
          reason: supplierReturnForm.reason,
          notes: supplierReturnForm.notes || undefined,
          lines: supplierReturnLines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            quantity: Number(l.quantity),
          })),
        }),
      });
      setSupplierReturnForm((f) => ({ ...f, notes: "" }));
      setSupplierReturnLines(
        materials[0] ? [{ materialCatalogItemId: materials[0].id, quantity: "1" }] : [],
      );
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendSupplierReturn(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/supplier-returns/${id}/send`, { method: "POST" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSupplierReturn(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/supplier-returns/${id}/confirm`, { method: "POST" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
        {t("supplierReturns")}
      </h2>
      <form onSubmit={createSupplierReturn} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label={ta("supplier")}
            className="input w-auto"
            value={supplierReturnForm.supplierId}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, supplierId: e.target.value }))
            }
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select aria-label={ta("purchaseOrder")}
            className="input w-auto"
            value={supplierReturnForm.purchaseOrderId}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, purchaseOrderId: e.target.value }))
            }
          >
            {supplierReturnPOs.length === 0 && <option value="">—</option>}
            {supplierReturnPOs.map((po) => (
              <option key={po.id} value={po.id}>
                PO {po.id.slice(0, 8)} ({po.status})
              </option>
            ))}
          </select>
          <select aria-label={t("returnReasonLabel")}
            className="input w-auto"
            value={supplierReturnForm.reason}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({
                ...f,
                reason: e.target.value as (typeof SUPPLIER_RETURN_REASONS)[number],
              }))
            }
          >
            {SUPPLIER_RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`returnReason_${r}`)}
              </option>
            ))}
          </select>
          <input
            placeholder={t("note")} aria-label={t("note")}
            className="input w-48"
            value={supplierReturnForm.notes}
            onChange={(e) =>
              setSupplierReturnForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </div>

        {supplierReturnLines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <MaterialPicker
              id={`supplier-return-material-${i}`}
              materials={materials}
              value={line.materialCatalogItemId}
              onChange={(id) =>
                setSupplierReturnLines((ls) =>
                  ls.map((l, idx) => (idx === i ? { ...l, materialCatalogItemId: id } : l)),
                )
              }
            />
            <input aria-label={t("movementQuantity")}
              type="number"
              step="0.01"
              className="input w-24"
              value={line.quantity}
              onChange={(e) =>
                setSupplierReturnLines((ls) =>
                  ls.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)),
                )
              }
            />
            <button
              type="button"
              onClick={() => setSupplierReturnLines((ls) => ls.filter((_, idx) => idx !== i))}
              className="text-xs text-fg-subtle hover:text-danger-fg"
            >
              {tc("delete")}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button type="button" onClick={addSupplierReturnLine} className="btn-secondary w-fit px-2 py-1 text-xs">
            {t("addLine")}
          </button>
          <button type="submit" disabled={busy || !supplierReturnForm.purchaseOrderId} className="btn-primary w-fit">
            {t("newSupplierReturn")}
          </button>
        </div>
      </form>

      {supplierReturns && supplierReturns.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("material")}</th>
                <th scope="col">{tc("status")}</th>
                <th scope="col">{t("returnReasonLabel")}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {supplierReturns.map((sr) => (
                <tr key={sr.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    {sr.supplier.name} —{" "}
                    {sr.lines.map((l) => `${l.materialCatalogItem.name} (${l.quantity} ${l.materialCatalogItem.unit})`).join(", ")}
                  </td>
                  <td>
                    <Badge tone={sr.status === "draft" ? "neutral" : sr.status === "sent" ? "brand" : "success"}>
                      {t(`returnStatus_${sr.status}`)}
                    </Badge>
                  </td>
                  <td className="text-xs text-fg-subtle">{t(`returnReason_${sr.reason}`)}</td>
                  <td className="text-right">
                    {sr.status === "draft" && (
                      <button onClick={() => sendSupplierReturn(sr.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        {t("sendReturn")}
                      </button>
                    )}
                    {sr.status === "sent" && (
                      <button onClick={() => confirmSupplierReturn(sr.id)} disabled={busy} className="btn-secondary px-2 py-1 text-xs">
                        {t("confirmReturn")}
                      </button>
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
