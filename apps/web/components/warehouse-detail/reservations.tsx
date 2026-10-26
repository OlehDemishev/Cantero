"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch, notifyApiError } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";
import { MaterialPicker } from "./material-picker";
import { useWarehouseDetail } from "./context";
import type { StockReservation } from "./types";

/** Stock set aside (for a project or a note): reserve some, release it again. */
export function Reservations() {
  const t = useTranslations("warehouses");
  const { warehouseId, materials, version, busy, setBusy, refresh } = useWarehouseDetail();
  const [reservations, setReservations] = useState<StockReservation[] | null>(
    null,
  );
  const [reservationForm, setReservationForm] = useState({
    materialCatalogItemId: "",
    quantity: "1",
    note: "",
  });

  useEffect(() => {
    apiFetch<StockReservation[]>(
      `/materials/stock-reservations?warehouseId=${warehouseId}`,
    ).then(setReservations).catch(notifyApiError);
  }, [warehouseId, version]);

  useEffect(() => {
    if (materials[0]) resetStateInEffect(() => setReservationForm((r) => ({ ...r, materialCatalogItemId: materials[0].id })));
  }, [materials]);

  async function createReservation(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/materials/stock-reservations", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          materialCatalogItemId: reservationForm.materialCatalogItemId,
          quantity: Number(reservationForm.quantity),
          note: reservationForm.note || undefined,
        }),
      });
      setReservationForm((r) => ({ ...r, note: "" }));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function releaseReservation(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/materials/stock-reservations/${id}/release`, {
        method: "POST",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">
        {t("reservations")}
      </h2>
      <form onSubmit={createReservation} className="flex flex-wrap items-end gap-2">
        <MaterialPicker
          id="reservation-material"
          materials={materials}
          value={reservationForm.materialCatalogItemId}
          onChange={(id) =>
            setReservationForm((r) => ({ ...r, materialCatalogItemId: id }))
          }
        />
        <input aria-label={t("movementQuantity")}
          type="number"
          step="0.01"
          className="input w-24"
          value={reservationForm.quantity}
          onChange={(e) =>
            setReservationForm((r) => ({ ...r, quantity: e.target.value }))
          }
        />
        <input
          placeholder={t("reservationNotePlaceholder")} aria-label={t("reservationNotePlaceholder")}
          className="input w-48"
          value={reservationForm.note}
          onChange={(e) =>
            setReservationForm((r) => ({ ...r, note: e.target.value }))
          }
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("newReservation")}
        </button>
      </form>

      {reservations && reservations.filter((r) => r.status === "active").length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th scope="col" className="py-2">{t("material")}</th>
                <th scope="col">{t("quantity")}</th>
                <th scope="col">{t("movementProject")}</th>
                <th scope="col">{t("note")}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {reservations
                .filter((r) => r.status === "active")
                .map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{r.materialCatalogItem.name}</td>
                    <td>
                      {r.quantity} {r.materialCatalogItem.unit}
                    </td>
                    <td>
                      {r.project ? (
                        <Link
                          href={`/projects/${r.project.id}`}
                          className="text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          {r.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs text-fg-subtle">{r.note ?? "—"}</td>
                    <td className="text-right">
                      <button
                        onClick={() => releaseReservation(r.id)}
                        disabled={busy}
                        className="text-xs text-fg-subtle hover:text-danger-fg"
                      >
                        {t("releaseReservation")}
                      </button>
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
