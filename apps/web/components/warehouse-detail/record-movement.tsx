"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { MaterialPicker } from "./material-picker";
import { useWarehouseDetail } from "./context";
import { GENERIC_MOVEMENT_TYPES, type SerialUnit } from "./types";

/** Book a receipt, issue or write-off, naming the units of a serial-tracked material. */
export function RecordMovement() {
  const t = useTranslations("warehouses");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { warehouseId, materials, busy, setBusy, refresh } = useWarehouseDetail();
  const [movement, setMovement] = useState({
    materialCatalogItemId: "",
    type: "receipt" as (typeof GENERIC_MOVEMENT_TYPES)[number],
    quantity: "1",
    unitCost: "",
  });
  const [serialNumberDrafts, setSerialNumberDrafts] = useState<string[]>([""]);
  const [availableSerialUnits, setAvailableSerialUnits] = useState<SerialUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  useEffect(() => {
    if (materials[0]) resetStateInEffect(() => setMovement((m) => ({ ...m, materialCatalogItemId: materials[0].id })));
  }, [materials]);

  const movementMaterial = materials.find(
    (m) => m.id === movement.materialCatalogItemId,
  );

  function loadAvailableSerialUnits(materialCatalogItemId: string) {
    apiFetch<SerialUnit[]>(
      `/materials/stock/serial-units?warehouseId=${warehouseId}&materialCatalogItemId=${materialCatalogItemId}`,
    ).then(setAvailableSerialUnits).catch(notifyApiError);
  }

  useEffect(() => {
    if (movementMaterial?.serialTracked && movement.type !== "receipt") {
      loadAvailableSerialUnits(movementMaterial.id);
    } else {
      resetStateInEffect(() => setAvailableSerialUnits([]));
    }
    resetStateInEffect(() => setSelectedUnitIds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementMaterial?.id, movement.type]);

  async function recordMovement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const serialTracked = !!movementMaterial?.serialTracked;
      await apiFetch("/materials/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId: movement.materialCatalogItemId,
          type: movement.type,
          quantity: Number(movement.quantity),
          unitCost:
            movement.type === "receipt" && movement.unitCost
              ? Number(movement.unitCost)
              : undefined,
          serialNumbers:
            serialTracked && movement.type === "receipt"
              ? serialNumberDrafts.filter((s) => s.trim())
              : undefined,
          unitIds:
            serialTracked && movement.type !== "receipt" && selectedUnitIds.length > 0
              ? selectedUnitIds
              : undefined,
        }),
      });
      setMovement((m) => ({ ...m, unitCost: "" }));
      setSerialNumberDrafts([""]);
      setSelectedUnitIds([]);
      if (serialTracked && movement.type !== "receipt") {
        loadAvailableSerialUnits(movement.materialCatalogItemId);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
        {t("recordMovement")}
      </h2>
      <form
        onSubmit={recordMovement}
        className="flex flex-wrap items-end gap-2"
      >
        <MaterialPicker
          id="movement-material"
          materials={materials}
          value={movement.materialCatalogItemId}
          onChange={(id) =>
            setMovement((m) => ({ ...m, materialCatalogItemId: id }))
          }
        />
        <select aria-label={ta("movementType")}
          className="input w-auto"
          value={movement.type}
          onChange={(e) =>
            setMovement((m) => ({
              ...m,
              type: e.target.value as (typeof GENERIC_MOVEMENT_TYPES)[number],
            }))
          }
        >
          {GENERIC_MOVEMENT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(ty)}
            </option>
          ))}
        </select>
        <input aria-label={t("movementQuantity")}
          type="number"
          step="0.01"
          className="input w-24"
          value={movement.quantity}
          onChange={(e) =>
            setMovement((m) => ({ ...m, quantity: e.target.value }))
          }
        />
        {movement.type === "receipt" && (
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder={t("unitCostPlaceholder")} aria-label={t("unitCostPlaceholder")}
            className="input w-32"
            value={movement.unitCost}
            onChange={(e) =>
              setMovement((m) => ({ ...m, unitCost: e.target.value }))
            }
          />
        )}
        <button type="submit" disabled={busy} className="btn-secondary">
          {tc("save")}
        </button>

        {movementMaterial?.serialTracked && movement.type === "receipt" && (
          <div className="mt-2 flex w-full flex-col gap-1.5">
            <span className="text-xs text-fg-subtle">
              {t("serialNumbers")}
              {Number(movement.quantity) !== serialNumberDrafts.filter((s) => s.trim()).length && (
                <span className="ml-2 text-danger-fg">{t("unitCountMismatch")}</span>
              )}
            </span>
            {serialNumberDrafts.map((sn, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input aria-label={ta("serialNumber", { n: i + 1 })}
                  className="input w-40"
                  placeholder={`SN-${i + 1}`}
                  value={sn}
                  onChange={(e) =>
                    setSerialNumberDrafts((d) =>
                      d.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setSerialNumberDrafts((d) => d.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-fg-subtle hover:text-danger-fg"
                >
                  {tc("delete")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSerialNumberDrafts((d) => [...d, ""])}
              className="btn-secondary w-fit px-2 py-1 text-xs"
            >
              {t("addSerialNumber")}
            </button>
          </div>
        )}

        {movementMaterial?.serialTracked && movement.type !== "receipt" && (
          <div className="mt-2 flex w-full flex-col gap-1.5">
            <span className="text-xs text-fg-subtle">
              {t("selectUnits")}
              {selectedUnitIds.length > 0 &&
                Number(movement.quantity) !== selectedUnitIds.length && (
                  <span className="ml-2 text-danger-fg">{t("unitCountMismatch")}</span>
                )}
            </span>
            {availableSerialUnits.length === 0 ? (
              <span className="text-xs text-fg-subtle">{t("noAvailableUnits")}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableSerialUnits.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnitIds.includes(u.id)}
                      onChange={(e) =>
                        setSelectedUnitIds((ids) =>
                          e.target.checked
                            ? [...ids, u.id]
                            : ids.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.serialNumber}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </>
  );
}
