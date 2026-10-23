"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useWarehouseDetail } from "./context";

/** Assemble kits from their components here, or take them apart again. */
export function StockKits() {
  const t = useTranslations("warehouses");
  const { warehouseId, busy, setBusy, refresh } = useWarehouseDetail();
  const [stockKits, setStockKits] = useState<{ id: string; name: string }[]>([]);
  const [assembleForm, setAssembleForm] = useState({ kitId: "", quantity: "1" });

  useEffect(() => {
    apiFetch<{ id: string; name: string }[]>("/materials/stock-kits").then((kits) => {
      setStockKits(kits);
      if (kits[0]) setAssembleForm((f) => ({ ...f, kitId: kits[0].id }));
    }).catch(notifyApiError);
  }, [warehouseId]);

  async function assembleKit() {
    if (!assembleForm.kitId) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-kits/${assembleForm.kitId}/assemble`, {
        method: "POST",
        body: JSON.stringify({ warehouseId, quantity: Number(assembleForm.quantity) }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disassembleKit() {
    if (!assembleForm.kitId) return;
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-kits/${assembleForm.kitId}/disassemble`, {
        method: "POST",
        body: JSON.stringify({ warehouseId, quantity: Number(assembleForm.quantity) }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {stockKits.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
            {t("kit")}
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label={t("kit")}
              className="input w-auto"
              value={assembleForm.kitId}
              onChange={(e) => setAssembleForm((f) => ({ ...f, kitId: e.target.value }))}
            >
              {stockKits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <input aria-label={t("movementQuantity")}
              type="number"
              step="0.01"
              className="input w-24"
              value={assembleForm.quantity}
              onChange={(e) => setAssembleForm((f) => ({ ...f, quantity: e.target.value }))}
            />
            <button type="button" onClick={assembleKit} disabled={busy} className="btn-primary">
              {t("assembleKit")}
            </button>
            <button type="button" onClick={disassembleKit} disabled={busy} className="btn-secondary">
              {t("disassembleKit")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
