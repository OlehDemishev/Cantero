"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { DEPRECIATION_METHODS, type DepreciationMethod, type EquipmentStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { EquipmentGpsPanel } from "@/components/equipment-gps-panel";
import { CalibrationPanel } from "@/components/calibration-panel";
import { EquipmentMaintenanceRecordsPanel } from "@/components/equipment-maintenance-records-panel";
import { EquipmentFuelLogsPanel } from "@/components/equipment-fuel-logs-panel";
import { EquipmentRentalHistoryPanel } from "@/components/equipment-rental-history-panel";
import { EquipmentAssignmentHistoryPanel } from "@/components/equipment-assignment-history-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";
import { formatDate } from "@/lib/format-date";

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

interface Project {
  id: string;
  name: string;
}
interface Worker {
  id: string;
  name: string;
}
interface AssignmentSummary {
  project: { id: string; name: string } | null;
  worker: { id: string; name: string } | null;
}
interface DepreciationResult {
  monthsElapsed: number;
  accumulatedDepreciation: number;
  bookValue: number;
}
interface AssetDisposal {
  id: string;
  disposedAt: string;
  saleAmount: string | null;
  notes: string | null;
}
interface Equipment {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  status: EquipmentStatus;
  notes: string | null;
  assignments: AssignmentSummary[];
  maintenanceIntervalDays: number | null;
  nextMaintenanceDueAt: string | null;
  currentMeterHours: string | null;
  maintenanceIntervalHours: string | null;
  nextMaintenanceDueHours: string | null;
  depreciationMethod: DepreciationMethod | null;
  usefulLifeMonths: number | null;
  salvageValue: string | null;
  depreciation: DepreciationResult | null;
  disposal: AssetDisposal | null;
}
interface Rental {
  id: string;
  renterName: string;
  renterContact: string | null;
  dailyRate: string;
  startDate: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  notes: string | null;
  daysElapsed: number;
  revenue: number;
}
const STATUS_STYLES: Record<EquipmentStatus, string> = {
  available: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  in_use: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
  maintenance: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  retired: "bg-error-50 dark:bg-error-500/15 text-error-700 dark:text-error-500",
  rented_out: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
};

export default function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const { data: me } = useMe();
  const currency = me?.company.currency ?? "";

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [checkOutForm, setCheckOutForm] = useState({ projectId: "", workerId: "" });
  const [rentalForm, setRentalForm] = useState({ renterName: "", renterContact: "", dailyRate: "", expectedReturnDate: "", notes: "" });
  const [scheduleIntervalDays, setScheduleIntervalDays] = useState("");
  const [scheduleIntervalHours, setScheduleIntervalHours] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [depreciationForm, setDepreciationForm] = useState({ method: "" as DepreciationMethod | "", usefulLifeMonths: "", salvageValue: "" });
  const [disposeForm, setDisposeForm] = useState({ saleAmount: "", notes: "" });
  const [disposing, setDisposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Equipment>(`/equipment/${id}`).then((e) => {
      setEquipment(e);
      setScheduleIntervalDays(e.maintenanceIntervalDays !== null ? String(e.maintenanceIntervalDays) : "");
      setScheduleIntervalHours(e.maintenanceIntervalHours !== null ? e.maintenanceIntervalHours : "");
      setMeterReading(e.currentMeterHours !== null ? e.currentMeterHours : "");
      setDepreciationForm({
        method: e.depreciationMethod ?? "",
        usefulLifeMonths: e.usefulLifeMonths !== null ? String(e.usefulLifeMonths) : "",
        salvageValue: e.salvageValue !== null ? e.salvageValue : "",
      });
    });
    apiFetch<Rental[]>(`/equipment/${id}/rentals`).then(setRentals);
  }

  useEffect(() => {
    load();
    apiFetch<Project[]>("/projects").then(setProjects);
    apiFetch<Worker[]>("/workers").then(setWorkers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function checkOut(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const position = await getCurrentPositionSafe();
      await apiFetch(`/equipment/${id}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          projectId: checkOutForm.projectId || undefined,
          workerId: checkOutForm.workerId || undefined,
          lat: position?.lat,
          lng: position?.lng,
        }),
      });
      setCheckOutForm({ projectId: "", workerId: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    const position = await getCurrentPositionSafe();
    await apiFetch(`/equipment/${id}/check-in`, {
      method: "POST",
      body: JSON.stringify({ lat: position?.lat, lng: position?.lng }),
    });
    load();
  }

  async function startMaintenance() {
    await apiFetch(`/equipment/${id}/maintenance/start`, { method: "POST" });
    load();
  }

  async function completeMaintenance() {
    await apiFetch(`/equipment/${id}/maintenance/complete`, { method: "POST" });
    load();
  }

  async function retire() {
    await apiFetch(`/equipment/${id}/retire`, { method: "POST" });
    load();
  }

  async function startRental(e: React.FormEvent) {
    e.preventDefault();
    if (!rentalForm.renterName || !rentalForm.dailyRate) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${id}/rentals`, {
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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function endRental() {
    await apiFetch(`/equipment/${id}/rentals/return`, { method: "POST" });
    load();
  }

  async function saveDepreciationSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/depreciation-schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          depreciationMethod: depreciationForm.method || null,
          usefulLifeMonths: depreciationForm.usefulLifeMonths ? Number(depreciationForm.usefulLifeMonths) : null,
          salvageValue: depreciationForm.salvageValue ? Number(depreciationForm.salvageValue) : null,
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function dispose(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${id}/dispose`, {
        method: "POST",
        body: JSON.stringify({
          saleAmount: disposeForm.saleAmount ? Number(disposeForm.saleAmount) : undefined,
          notes: disposeForm.notes || undefined,
        }),
      });
      setDisposing(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/maintenance-schedule`, {
        method: "PATCH",
        body: JSON.stringify({ intervalDays: scheduleIntervalDays ? Number(scheduleIntervalDays) : null }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function clearSchedule() {
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/maintenance-schedule`, { method: "PATCH", body: JSON.stringify({ intervalDays: null }) });
      setScheduleIntervalDays("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveHoursSchedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/maintenance-schedule`, {
        method: "PATCH",
        body: JSON.stringify({ intervalHours: scheduleIntervalHours ? Number(scheduleIntervalHours) : null }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function clearHoursSchedule() {
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/maintenance-schedule`, { method: "PATCH", body: JSON.stringify({ intervalHours: null }) });
      setScheduleIntervalHours("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveMeterReading(e: React.FormEvent) {
    e.preventDefault();
    if (!meterReading) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/equipment/${id}/meter-reading`, {
        method: "PATCH",
        body: JSON.stringify({ currentMeterHours: Number(meterReading) }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  if (!equipment) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{equipment.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {equipment.category}
            {equipment.serialNumber && ` · ${equipment.serialNumber}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[equipment.status]}`}>
          {t(`status_${equipment.status}`)}
        </span>
      </div>
      {error && <p className="mt-4 rounded-md bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{tc("actions")}</h2>
          {equipment.status === "available" && (
            <form onSubmit={checkOut} className="flex flex-col gap-3">
              <select
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
              <select
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
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("rentOutToThirdParty")}</span>
              <input
                required
                placeholder={t("renterNamePlaceholder")}
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
                  placeholder={t("dailyRatePlaceholder", { currency })}
                  className="input w-40"
                  value={rentalForm.dailyRate}
                  onChange={(e) => setRentalForm((f) => ({ ...f, dailyRate: e.target.value }))}
                />
                <input
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

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("maintenanceSchedule")}</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("maintenanceScheduleHint")}</p>
          {equipment.nextMaintenanceDueAt && (
            <p
              className={`mb-3 text-sm ${
                new Date(equipment.nextMaintenanceDueAt) < new Date() ? "font-medium text-error-600" : "text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("nextDue", { date: formatDate(new Date(equipment.nextMaintenanceDueAt)) })}
            </p>
          )}
          <form onSubmit={saveSchedule} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("intervalDays")}
              <input
                type="number"
                min="1"
                max="3650"
                placeholder={t("intervalDaysPlaceholder")}
                className="input w-32"
                value={scheduleIntervalDays}
                onChange={(e) => setScheduleIntervalDays(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy} className="btn-secondary">
              {tc("save")}
            </button>
            {equipment.maintenanceIntervalDays !== null && (
              <button type="button" onClick={clearSchedule} disabled={busy} className="btn-secondary">
                {t("disableSchedule")}
              </button>
            )}
          </form>

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
              {t("currentMeterHours")}: {equipment.currentMeterHours ?? "—"}
              {equipment.nextMaintenanceDueHours !== null && (
                <span
                  className={
                    Number(equipment.currentMeterHours ?? 0) >= Number(equipment.nextMaintenanceDueHours)
                      ? "ml-2 font-medium text-error-600"
                      : "ml-2 text-gray-500 dark:text-gray-400"
                  }
                >
                  {t("nextDueHours", { hours: equipment.nextMaintenanceDueHours })}
                </span>
              )}
            </p>
            <form onSubmit={saveMeterReading} className="mb-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("updateMeterReading")}
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input w-32"
                  value={meterReading}
                  onChange={(e) => setMeterReading(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy} className="btn-secondary">
                {tc("save")}
              </button>
            </form>
            <form onSubmit={saveHoursSchedule} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("intervalHours")}
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("intervalHoursPlaceholder")}
                  className="input w-32"
                  value={scheduleIntervalHours}
                  onChange={(e) => setScheduleIntervalHours(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy} className="btn-secondary">
                {tc("save")}
              </button>
              {equipment.maintenanceIntervalHours !== null && (
                <button type="button" onClick={clearHoursSchedule} disabled={busy} className="btn-secondary">
                  {t("disableSchedule")}
                </button>
              )}
            </form>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("depreciation")}</h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("depreciationHint")}</p>

          {equipment.disposal ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t("disposedOn", { date: formatDate(new Date(equipment.disposal.disposedAt)) })}
              {equipment.disposal.saleAmount !== null && (
                <span className="block text-xs text-gray-400 dark:text-gray-500">
                  {t("saleAmount")}: {equipment.disposal.saleAmount} {currency}
                </span>
              )}
            </p>
          ) : (
            <>
              {equipment.depreciation && (
                <p className="mb-3 text-sm text-gray-700 dark:text-gray-200">
                  {t("bookValue")}: <span className="font-medium">{equipment.depreciation.bookValue} {currency}</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    ({t("accumulatedDepreciation")}: {equipment.depreciation.accumulatedDepreciation} {currency})
                  </span>
                </p>
              )}
              <form onSubmit={saveDepreciationSchedule} className="flex flex-wrap items-end gap-2">
                <select
                  className="input"
                  value={depreciationForm.method}
                  onChange={(e) => setDepreciationForm((f) => ({ ...f, method: e.target.value as DepreciationMethod }))}
                >
                  <option value="">{t("noDepreciationMethod")}</option>
                  {DEPRECIATION_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`depreciationMethod_${m}`)}
                    </option>
                  ))}
                </select>
                <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("usefulLifeMonths")}
                  <input
                    type="number"
                    min="1"
                    max="600"
                    className="input w-32"
                    value={depreciationForm.usefulLifeMonths}
                    onChange={(e) => setDepreciationForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("salvageValue")}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-32"
                    value={depreciationForm.salvageValue}
                    onChange={(e) => setDepreciationForm((f) => ({ ...f, salvageValue: e.target.value }))}
                  />
                </label>
                <button type="submit" disabled={busy} className="btn-secondary">
                  {tc("save")}
                </button>
              </form>

              {equipment.status !== "in_use" && equipment.status !== "rented_out" && (
                <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                  {!disposing ? (
                    <button onClick={() => setDisposing(true)} className="btn-secondary px-3 py-1.5 text-xs">
                      {t("disposeOfEquipment")}
                    </button>
                  ) : (
                    <form onSubmit={dispose} className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("saleAmount")}
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input w-32"
                          value={disposeForm.saleAmount}
                          onChange={(e) => setDisposeForm((f) => ({ ...f, saleAmount: e.target.value }))}
                        />
                      </label>
                      <input
                        placeholder={t("disposalNotesPlaceholder")}
                        className="input"
                        value={disposeForm.notes}
                        onChange={(e) => setDisposeForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                      <button type="submit" disabled={busy} className="btn-primary">
                        {t("confirmDisposal")}
                      </button>
                      <button type="button" onClick={() => setDisposing(false)} className="btn-secondary">
                        {tc("cancel")}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <EquipmentMaintenanceRecordsPanel equipmentId={id} currency={currency} />

        <CalibrationPanel equipmentId={id} />

        <EquipmentFuelLogsPanel equipmentId={id} currency={currency} />

        <EquipmentRentalHistoryPanel equipmentId={id} currency={currency} />

        <EquipmentGpsPanel equipmentId={id} />

        <EquipmentAssignmentHistoryPanel equipmentId={id} />
      </div>
    </AuthenticatedShell>
  );
}
