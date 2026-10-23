"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useWarehouseDetail } from "./context";
import type { StockLevel, WarehouseLocationOption } from "./types";

/** What the warehouse holds, reserved and available, and where each material is binned. */
export function StockLevels() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { warehouseId, version, busy, setBusy, refresh } = useWarehouseDetail();
  const { data: levels = null, error: levelsError, reload: reloadLevels } = useApi<StockLevel[]>(
    `/materials/stock/levels?warehouseId=${warehouseId}`,
  );
  const [editingBinFor, setEditingBinFor] = useState<string | null>(null);
  const [binDraft, setBinDraft] = useState("");
  const [warehouseLocationOptions, setWarehouseLocationOptions] = useState<
    WarehouseLocationOption[]
  >([]);

  // The levels load with the warehouse; after a change elsewhere they load again.
  const seenVersion = useRef(version);
  useEffect(() => {
    if (seenVersion.current === version) return;
    seenVersion.current = version;
    void reloadLevels();
  }, [version, reloadLevels]);

  useEffect(() => {
    apiFetch<WarehouseLocationOption[]>(
      `/materials/warehouse-locations?warehouseId=${warehouseId}`,
    ).then(setWarehouseLocationOptions).catch(notifyApiError);
  }, [warehouseId, version]);

  async function saveBinLocationRef(materialCatalogItemId: string, binLocationId: string) {
    setBusy(true);
    try {
      await apiFetch("/materials/stock/bin-location-ref", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId,
          binLocationId: binLocationId || null,
        }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveBinLocation(materialCatalogItemId: string) {
    setBusy(true);
    try {
      await apiFetch("/materials/stock/bin-location", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId,
          binLocation: binDraft || null,
        }),
      });
      setEditingBinFor(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
        {t("stockLevels")}
      </h2>
      {!levels ? (
        levelsError ? <ErrorState error={levelsError} onRetry={reloadLevels} compact /> : <Skeleton lines={3} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("material")}</th>
                <th scope="col">{t("quantity")}</th>
                <th scope="col">{t("reserved")}</th>
                <th scope="col">{t("available")}</th>
                <th scope="col">{t("bin")}</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-gray-100 dark:border-gray-700"
                >
                  <td className="py-2">
                    {l.materialCatalogItem.name} ({l.materialCatalogItem.code})
                  </td>
                  <td
                    className={
                      Number(l.quantityOnHand) < 0 ? "text-danger-fg" : ""
                    }
                  >
                    {l.quantityOnHand} {l.materialCatalogItem.unit}
                  </td>
                  <td className="text-fg-subtle">
                    {l.reserved > 0 ? `${l.reserved} ${l.materialCatalogItem.unit}` : "—"}
                  </td>
                  <td className={l.available < 0 ? "text-danger-fg" : ""}>
                    {l.available} {l.materialCatalogItem.unit}
                  </td>
                  <td>
                    {warehouseLocationOptions.length > 0 ? (
                      <select aria-label={ta("fieldOf", { field: ta("binLocation"), item: l.materialCatalogItem.name })}
                        className="input w-auto py-0.5 text-xs"
                        value={l.binLocationId ?? ""}
                        onChange={(e) =>
                          saveBinLocationRef(l.materialCatalogItem.id, e.target.value)
                        }
                      >
                        <option value="">{t("setBin")}</option>
                        {warehouseLocationOptions.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {t(loc.kind)} {loc.code}
                          </option>
                        ))}
                      </select>
                    ) : editingBinFor === l.materialCatalogItem.id ? (
                      <span className="flex items-center gap-1">
                        <input aria-label={ta("fieldOf", { field: ta("binLocation"), item: l.materialCatalogItem.name })}
                          autoFocus
                          className="input w-24 py-0.5 text-xs"
                          value={binDraft}
                          onChange={(e) => setBinDraft(e.target.value)}
                        />
                        <button
                          onClick={() =>
                            saveBinLocation(l.materialCatalogItem.id)
                          }
                          disabled={busy}
                          className="btn-primary px-1.5 py-0.5 text-xs"
                        >
                          {tc("save")}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingBinFor(l.materialCatalogItem.id);
                          setBinDraft(l.binLocation ?? "");
                        }}
                        className="text-xs text-fg-subtle hover:underline"
                      >
                        {l.binLocation ?? t("setBin")}
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
