"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import type { EquipmentCardProps, Project, Rental, Worker } from "./types";

function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

/** What can be done with the equipment now: check out or in, rent out, maintenance, retire. */
export function ActionsCard({ equipmentId, equipment, currency, busy, setBusy, setError, reload }: EquipmentCardProps) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { data: projects = [] } = useApi<Project[]>("/projects");
  const { data: workers = [] } = useApi<Worker[]>("/workers");
  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [checkOutForm, setCheckOutForm] = useState({ projectId: "", workerId: "" });
  const [rentalForm, setRentalForm] = useState({ renterName: "", renterContact: "", dailyRate: "", expectedReturnDate: "", notes: "" });

  // The rentals load again with every load of the equipment.
  useEffect(() => {
    apiFetch<Rental[]>(`/equipment/${equipmentId}/rentals`)
      .then(setRentals)
      .catch(() => setRentals([]));
  }, [equipmentId, equipment]);

  async function checkOut(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const position = await getCurrentPositionSafe();
      await apiFetch(`/equipment/${equipmentId}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          projectId: checkOutForm.projectId || undefined,
          workerId: checkOutForm.workerId || undefined,
          lat: position?.lat,
          lng: position?.lng,
        }),
      });
      setCheckOutForm({ projectId: "", workerId: "" });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    const position = await getCurrentPositionSafe();
    await apiFetch(`/equipment/${equipmentId}/check-in`, {
      method: "POST",
      body: JSON.stringify({ lat: position?.lat, lng: position?.lng }),
    });
    reload();
  }

  async function startMaintenance() {
    await apiFetch(`/equipment/${equipmentId}/maintenance/start`, { method: "POST" });
    reload();
  }

  async function completeMaintenance() {
    await apiFetch(`/equipment/${equipmentId}/maintenance/complete`, { method: "POST" });
    reload();
  }

  async function retire() {
    await apiFetch(`/equipment/${equipmentId}/retire`, { method: "POST" });
    reload();
  }

  async function startRental(e: React.FormEvent) {
    e.preventDefault();
    if (!rentalForm.renterName || !rentalForm.dailyRate) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${equipmentId}/rentals`, {
        method: "POST",
        body: JSON.stringify({
          renterName: rentalForm.renterName,
          renterContact: rentalForm.renterContact || undefined,
          dailyRate: Number(rentalForm.dailyRate),
          expectedReturnDate: rentalForm.expectedReturnDate ? new Date(rentalForm.expectedReturnDate).toISOString() : undefined,
          notes: rentalForm.notes || undefined,
        }),
      });
      setRentalForm({ renterName: "", renterContact: "", dailyRate: "", expectedReturnDate: "", notes: "" });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function endRental() {
    await apiFetch(`/equipment/${equipmentId}/rentals/return`, { method: "POST" });
    reload();
  }

  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{tc("actions")}</h2>
      {equipment.status === "available" && (
        <form onSubmit={checkOut} className="flex flex-col gap-3">
          <select aria-label={ta("project")}
            className="input"
            value={checkOutForm.projectId}
            onChange={(e) => setCheckOutForm((f) => ({ ...f, projectId: e.target.value }))}
          >
            <option value="">{t("selectProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select aria-label={ta("worker")}
            className="input"
            value={checkOutForm.workerId}
            onChange={(e) => setCheckOutForm((f) => ({ ...f, workerId: e.target.value }))}
          >
            <option value="">{t("selectWorker")}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="btn-primary">
            {t("checkOut")}
          </button>
        </form>
      )}
      {equipment.status === "in_use" && (
        <div>
          {equipment.assignments[0] && (equipment.assignments[0].worker || equipment.assignments[0].project) && (
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              {t("currentlyWith")}:{" "}
              {equipment.assignments[0].worker ? (
                <Link href={`/team/${equipment.assignments[0].worker.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                  {equipment.assignments[0].worker.name}
                </Link>
              ) : (
                <Link href={`/projects/${equipment.assignments[0].project!.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                  {equipment.assignments[0].project!.name}
                </Link>
              )}
            </p>
          )}
          <button onClick={checkIn} className="btn-primary">
            {t("checkIn")}
          </button>
        </div>
      )}
      {equipment.status === "maintenance" && (
        <button onClick={completeMaintenance} className="btn-primary">
          {t("completeMaintenance")}
        </button>
      )}
      {equipment.status === "rented_out" && (
        <div>
          {rentals?.find((r) => !r.actualReturnDate) && (
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              {t("currentlyRentedTo")}: {rentals.find((r) => !r.actualReturnDate)!.renterName}
            </p>
          )}
          <button onClick={endRental} className="btn-primary">
            {t("returnFromRental")}
          </button>
        </div>
      )}

      {equipment.status === "available" && (
        <form onSubmit={startRental} className="mt-4 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("rentOutToThirdParty")}</span>
          <input
            required
            placeholder={t("renterNamePlaceholder")} aria-label={t("renterNamePlaceholder")}
            className="input"
            value={rentalForm.renterName}
            onChange={(e) => setRentalForm((f) => ({ ...f, renterName: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              placeholder={t("dailyRatePlaceholder", { currency })} aria-label={t("dailyRatePlaceholder", { currency })}
              className="input w-40"
              value={rentalForm.dailyRate}
              onChange={(e) => setRentalForm((f) => ({ ...f, dailyRate: e.target.value }))}
            />
            <input aria-label={ta("expectedReturnDate")}
              type="date"
              className="input w-auto"
              value={rentalForm.expectedReturnDate}
              onChange={(e) => setRentalForm((f) => ({ ...f, expectedReturnDate: e.target.value }))}
            />
            <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
              {t("startRental")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-700 pt-4">
        {equipment.status === "available" && (
          <button onClick={startMaintenance} className="btn-secondary px-3 py-1.5 text-xs">
            {t("startMaintenance")}
          </button>
        )}
        {equipment.status !== "in_use" && equipment.status !== "rented_out" && equipment.status !== "retired" && (
          <button onClick={retire} className="btn-secondary px-3 py-1.5 text-xs">
            {t("retire")}
          </button>
        )}
      </div>
    </section>
  );
}
