"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EquipmentStatus } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { EquipmentGpsPanel } from "@/components/equipment-gps-panel";
import { apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/use-me";

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
  project: { name: string } | null;
  worker: { name: string } | null;
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
}
interface Assignment {
  id: string;
  checkedOutAt: string;
  checkedInAt: string | null;
  notes: string | null;
  project: { name: string } | null;
  worker: { name: string } | null;
  checkOutWithinGeofence: boolean | null;
  checkInWithinGeofence: boolean | null;
}
interface MaintenanceRecord {
  id: string;
  description: string;
  cost: string | null;
  performedAt: string;
}

const STATUS_STYLES: Record<EquipmentStatus, string> = {
  available: "bg-success-50 text-success-700",
  in_use: "bg-warning-50 text-warning-700",
  maintenance: "bg-gray-100 text-gray-600",
  retired: "bg-error-50 text-error-700",
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
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[] | null>(null);
  const [checkOutForm, setCheckOutForm] = useState({ projectId: "", workerId: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({ description: "", cost: "" });
  const [scheduleIntervalDays, setScheduleIntervalDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Equipment>(`/equipment/${id}`).then((e) => {
      setEquipment(e);
      setScheduleIntervalDays(e.maintenanceIntervalDays !== null ? String(e.maintenanceIntervalDays) : "");
    });
    apiFetch<Assignment[]>(`/equipment/${id}/assignments`).then(setAssignments);
    apiFetch<MaintenanceRecord[]>(`/equipment/${id}/maintenance-records`).then(setMaintenanceRecords);
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

  async function addMaintenanceRecord(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/equipment/${id}/maintenance-records`, {
        method: "POST",
        body: JSON.stringify({
          description: maintenanceForm.description,
          cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
        }),
      });
      setMaintenanceForm({ description: "", cost: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!equipment) {
    return (
      <AuthenticatedShell>
        <p className="text-gray-500">{tc("loading")}</p>
      </AuthenticatedShell>
    );
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{equipment.name}</h1>
          <p className="text-sm text-gray-500">
            {equipment.category}
            {equipment.serialNumber && ` · ${equipment.serialNumber}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[equipment.status]}`}>
          {t(`status_${equipment.status}`)}
        </span>
      </div>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{tc("actions")}</h2>
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
              {equipment.assignments[0] && (
                <p className="mb-3 text-sm text-gray-600">
                  {t("currentlyWith")}: {equipment.assignments[0].worker?.name ?? equipment.assignments[0].project?.name}
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

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            {equipment.status === "available" && (
              <button onClick={startMaintenance} className="btn-secondary px-3 py-1.5 text-xs">
                {t("startMaintenance")}
              </button>
            )}
            {equipment.status !== "in_use" && equipment.status !== "retired" && (
              <button onClick={retire} className="btn-secondary px-3 py-1.5 text-xs">
                {t("retire")}
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("maintenanceSchedule")}</h2>
          <p className="mb-3 text-xs text-gray-500">{t("maintenanceScheduleHint")}</p>
          {equipment.nextMaintenanceDueAt && (
            <p
              className={`mb-3 text-sm ${
                new Date(equipment.nextMaintenanceDueAt) < new Date() ? "font-medium text-error-600" : "text-gray-700"
              }`}
            >
              {t("nextDue", { date: new Date(equipment.nextMaintenanceDueAt).toLocaleDateString() })}
            </p>
          )}
          <form onSubmit={saveSchedule} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
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
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("maintenanceRecords")}</h2>
          {!maintenanceRecords || maintenanceRecords.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400">{t("noMaintenanceRecords")}</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-2">
              {maintenanceRecords.map((r) => (
                <li key={r.id} className="border-b border-gray-100 pb-2 text-sm">
                  <div className="flex justify-between">
                    <span>{r.description}</span>
                    {r.cost && (
                      <span className="text-gray-500">
                        {r.cost} {currency}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.performedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addMaintenanceRecord} className="flex flex-col gap-2">
            <input
              required
              placeholder={t("descriptionPlaceholder")}
              className="input"
              value={maintenanceForm.description}
              onChange={(e) => setMaintenanceForm((f) => ({ ...f, description: e.target.value }))}
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder={t("cost")}
                className="input"
                value={maintenanceForm.cost}
                onChange={(e) => setMaintenanceForm((f) => ({ ...f, cost: e.target.value }))}
              />
              <button type="submit" disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                {t("addMaintenanceRecord")}
              </button>
            </div>
          </form>
        </section>

        <EquipmentGpsPanel equipmentId={id} />

        <section className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("assignmentHistory")}</h2>
          {!assignments || assignments.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noAssignments")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{tc("name")}</th>
                  <th>{t("checkedOutAt")}</th>
                  <th>{t("checkedInAt")}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="py-2">{a.worker?.name ?? a.project?.name ?? "—"}</td>
                    <td>
                      {new Date(a.checkedOutAt).toLocaleString()}
                      {a.checkOutWithinGeofence === false && (
                        <span className="ml-1 rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-700">
                          {t("offSite")}
                        </span>
                      )}
                    </td>
                    <td>
                      {a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : t("stillOut")}
                      {a.checkInWithinGeofence === false && (
                        <span className="ml-1 rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-700">
                          {t("offSite")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AuthenticatedShell>
  );
}
