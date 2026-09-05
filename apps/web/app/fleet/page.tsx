"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { VEHICLE_TYPES, type VehicleInspectionResult, type VehicleType } from "@cantero/shared";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Worker {
  id: string;
  name: string;
  cdlExpiresAt?: string | null;
}
interface Vehicle {
  id: string;
  name: string;
  vin: string | null;
  licensePlate: string | null;
  type: VehicleType;
  registrationExpiresAt: string | null;
  insuranceExpiresAt: string | null;
  odometerMiles: string | null;
  assignedDriver: { id: string; name: string } | null;
}
interface Inspection {
  id: string;
  inspectedAt: string;
  result: VehicleInspectionResult;
  inspectorName: string | null;
  notes: string | null;
}
interface VehicleDetail extends Vehicle {
  inspections: Inspection[];
}
interface FuelLog {
  id: string;
  filledAt: string;
  quantity: string;
  cost: string | null;
  odometerMiles: string | null;
  idleHours: string | null;
  notes: string | null;
}
interface FuelEfficiencyRow {
  vehicleId: string;
  vehicleName: string;
  totalQuantity: number;
  totalIdleHours: number;
  milesPerUnit: number | null;
}

function isExpiringSoon(dateStr: string | null): "expired" | "soon" | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  if (date < now) return "expired";
  if (date.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000) return "soon";
  return null;
}

export default function FleetPage() {
  const t = useTranslations("fleet");
  const tc = useTranslations("common");

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    vin: "",
    licensePlate: "",
    type: "truck" as VehicleType,
    assignedDriverId: "",
    registrationExpiresAt: "",
    insuranceExpiresAt: "",
  });
  const [inspectionForm, setInspectionForm] = useState({ result: "passed" as VehicleInspectionResult, inspectorName: "", notes: "" });
  const [fuelLogs, setFuelLogs] = useState<FuelLog[] | null>(null);
  const [fuelForm, setFuelForm] = useState({ quantity: "", cost: "", odometerMiles: "", idleHours: "" });
  const [fuelEfficiency, setFuelEfficiency] = useState<FuelEfficiencyRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Vehicle[]>("/vehicles").then(setVehicles);
    apiFetch<FuelEfficiencyRow[]>("/vehicles/fuel-efficiency-report").then(setFuelEfficiency);
  }
  useEffect(load, []);
  useEffect(() => {
    apiFetch<Worker[]>("/workers").then(setWorkers);
  }, []);

  async function createVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          vin: form.vin || undefined,
          licensePlate: form.licensePlate || undefined,
          type: form.type,
          assignedDriverId: form.assignedDriverId || undefined,
          registrationExpiresAt: form.registrationExpiresAt ? new Date(form.registrationExpiresAt).toISOString() : undefined,
          insuranceExpiresAt: form.insuranceExpiresAt ? new Date(form.insuranceExpiresAt).toISOString() : undefined,
        }),
      });
      setForm({ name: "", vin: "", licensePlate: "", type: "truck", assignedDriverId: "", registrationExpiresAt: "", insuranceExpiresAt: "" });
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setFuelLogs(null);
      return;
    }
    setExpandedId(id);
    const d = await apiFetch<VehicleDetail>(`/vehicles/${id}`);
    setDetail(d);
    apiFetch<FuelLog[]>(`/vehicles/${id}/fuel-logs`).then(setFuelLogs);
  }

  async function addFuelLog(id: string) {
    if (!fuelForm.quantity) return;
    setBusy(true);
    try {
      await apiFetch(`/vehicles/${id}/fuel-logs`, {
        method: "POST",
        body: JSON.stringify({
          quantity: Number(fuelForm.quantity),
          cost: fuelForm.cost ? Number(fuelForm.cost) : undefined,
          odometerMiles: fuelForm.odometerMiles ? Number(fuelForm.odometerMiles) : undefined,
          idleHours: fuelForm.idleHours ? Number(fuelForm.idleHours) : undefined,
        }),
      });
      setFuelForm({ quantity: "", cost: "", odometerMiles: "", idleHours: "" });
      apiFetch<FuelLog[]>(`/vehicles/${id}/fuel-logs`).then(setFuelLogs);
      apiFetch<FuelEfficiencyRow[]>("/vehicles/fuel-efficiency-report").then(setFuelEfficiency);
    } finally {
      setBusy(false);
    }
  }

  async function logInspection(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/vehicles/${id}/inspections`, {
        method: "POST",
        body: JSON.stringify({ result: inspectionForm.result, inspectorName: inspectionForm.inspectorName || undefined, notes: inspectionForm.notes || undefined }),
      });
      setInspectionForm({ result: "passed", inspectorName: "", notes: "" });
      const d = await apiFetch<VehicleDetail>(`/vehicles/${id}`);
      setDetail(d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthenticatedShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-3 py-1.5 text-sm">
            {t("addVehicle")}
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={createVehicle} className="card mt-4 flex max-w-lg flex-col gap-2">
          <input
            required
            placeholder={t("vehicleNamePlaceholder")}
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2">
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as VehicleType }))}>
              {VEHICLE_TYPES.map((vt) => (
                <option key={vt} value={vt}>
                  {t(`type_${vt}`)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("vinPlaceholder")}
              className="input"
              value={form.vin}
              onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))}
            />
            <input
              placeholder={t("licensePlatePlaceholder")}
              className="input"
              value={form.licensePlate}
              onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value }))}
            />
          </div>
          <select className="input" value={form.assignedDriverId} onChange={(e) => setForm((f) => ({ ...f, assignedDriverId: e.target.value }))}>
            <option value="">{t("noAssignedDriver")}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              {t("registrationExpiresAt")}
              <input
                type="date"
                className="input"
                value={form.registrationExpiresAt}
                onChange={(e) => setForm((f) => ({ ...f, registrationExpiresAt: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              {t("insuranceExpiresAt")}
              <input
                type="date"
                className="input"
                value={form.insuranceExpiresAt}
                onChange={(e) => setForm((f) => ({ ...f, insuranceExpiresAt: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {fuelEfficiency && fuelEfficiency.some((r) => r.totalQuantity > 0) && (
        <div className="card mt-6 overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{t("fuelEfficiencyTitle")}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5">{t("vehicle")}</th>
                <th className="text-right">{t("milesPerUnit")}</th>
                <th className="text-right">{t("totalIdleHours")}</th>
              </tr>
            </thead>
            <tbody>
              {fuelEfficiency
                .filter((r) => r.totalQuantity > 0)
                .map((r) => (
                  <tr key={r.vehicleId} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium text-gray-900">{r.vehicleName}</td>
                    <td className="text-right tabular-nums">{r.milesPerUnit ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.totalIdleHours}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        {!vehicles ? (
          <p className="text-gray-500">{tc("loading")}</p>
        ) : vehicles.length === 0 ? (
          <p className="text-gray-500">{t("noVehicles")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vehicles.map((v) => {
              const expanded = expandedId === v.id;
              const regFlag = isExpiringSoon(v.registrationExpiresAt);
              const insFlag = isExpiringSoon(v.insuranceExpiresAt);
              return (
                <li key={v.id} className="card">
                  <button onClick={() => toggleExpand(v.id)} className="flex w-full items-center justify-between text-left">
                    <span className="text-sm font-medium text-gray-900">
                      {v.name}
                      {v.licensePlate && <span className="ml-1.5 text-xs text-gray-400">({v.licensePlate})</span>}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {regFlag && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${regFlag === "expired" ? "bg-error-50 text-error-700" : "bg-warning-50 text-warning-700"}`}>
                          {t(regFlag === "expired" ? "registrationExpired" : "registrationExpiringSoon")}
                        </span>
                      )}
                      {insFlag && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${insFlag === "expired" ? "bg-error-50 text-error-700" : "bg-warning-50 text-warning-700"}`}>
                          {t(insFlag === "expired" ? "insuranceExpired" : "insuranceExpiringSoon")}
                        </span>
                      )}
                    </div>
                  </button>
                  <p className="mt-1 text-xs text-gray-400">
                    {t(`type_${v.type}`)}
                    {v.assignedDriver && ` · ${t("driver")}: ${v.assignedDriver.name}`}
                  </p>

                  {expanded && detail && detail.id === v.id && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
                      <div className="text-xs text-gray-500">
                        {v.registrationExpiresAt && <div>{t("registrationExpiresAt")}: {formatDate(new Date(v.registrationExpiresAt))}</div>}
                        {v.insuranceExpiresAt && <div>{t("insuranceExpiresAt")}: {formatDate(new Date(v.insuranceExpiresAt))}</div>}
                      </div>

                      <div>
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("inspections")}</h3>
                        {detail.inspections.length === 0 ? (
                          <p className="mb-2 text-xs text-gray-400">{t("noInspections")}</p>
                        ) : (
                          <ul className="mb-2 flex flex-col gap-1">
                            {detail.inspections.map((i) => (
                              <li key={i.id} className="text-xs">
                                <span className={i.result === "passed" ? "text-success-700" : "text-error-700"}>{t(`result_${i.result}`)}</span>
                                <span className="text-gray-400"> · {formatDate(new Date(i.inspectedAt))}</span>
                                {i.inspectorName && <span className="text-gray-400"> · {i.inspectorName}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                          <select
                            className="input w-auto"
                            value={inspectionForm.result}
                            onChange={(e) => setInspectionForm((f) => ({ ...f, result: e.target.value as VehicleInspectionResult }))}
                          >
                            <option value="passed">{t("result_passed")}</option>
                            <option value="failed">{t("result_failed")}</option>
                          </select>
                          <input
                            placeholder={t("inspectorNamePlaceholder")}
                            className="input w-auto"
                            value={inspectionForm.inspectorName}
                            onChange={(e) => setInspectionForm((f) => ({ ...f, inspectorName: e.target.value }))}
                          />
                          <button onClick={() => logInspection(v.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                            {t("logInspection")}
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("fuelLogs")}</h3>
                        {!fuelLogs || fuelLogs.length === 0 ? (
                          <p className="mb-2 text-xs text-gray-400">{t("noFuelLogs")}</p>
                        ) : (
                          <ul className="mb-2 flex flex-col gap-1">
                            {fuelLogs.map((f) => (
                              <li key={f.id} className="text-xs text-gray-600">
                                {f.quantity} · {formatDate(new Date(f.filledAt))}
                                {f.odometerMiles && <span className="text-gray-400"> · {f.odometerMiles} mi</span>}
                                {f.idleHours && <span className="text-gray-400"> · {t("idleHoursShort", { hours: f.idleHours })}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap items-end gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={t("quantityPlaceholder")}
                            className="input w-28"
                            value={fuelForm.quantity}
                            onChange={(e) => setFuelForm((f) => ({ ...f, quantity: e.target.value }))}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={t("costPlaceholder")}
                            className="input w-28"
                            value={fuelForm.cost}
                            onChange={(e) => setFuelForm((f) => ({ ...f, cost: e.target.value }))}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder={t("odometerPlaceholder")}
                            className="input w-32"
                            value={fuelForm.odometerMiles}
                            onChange={(e) => setFuelForm((f) => ({ ...f, odometerMiles: e.target.value }))}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder={t("idleHoursPlaceholder")}
                            className="input w-28"
                            value={fuelForm.idleHours}
                            onChange={(e) => setFuelForm((f) => ({ ...f, idleHours: e.target.value }))}
                          />
                          <button onClick={() => addFuelLog(v.id)} disabled={busy} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">
                            {t("addFuelLog")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AuthenticatedShell>
  );
}
