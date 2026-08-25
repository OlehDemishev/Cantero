"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Project {
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusMeters: number | null;
}

export function GeofencePanel({ projectId }: { projectId: string }) {
  const t = useTranslations("geofence");
  const tc = useTranslations("common");

  const [project, setProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ lat: "", lng: "", radiusMeters: "150" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Project>(`/projects/${projectId}`).then((p) => {
      setProject(p);
      setForm({
        lat: p.geofenceLat?.toString() ?? "",
        lng: p.geofenceLng?.toString() ?? "",
        radiusMeters: p.geofenceRadiusMeters?.toString() ?? "150",
      });
    });
  }

  useEffect(load, [projectId]);

  async function detectFromAddress() {
    setBusy(true);
    setError(null);
    try {
      const coords = await apiFetch<{ lat: number; lon: number } | null>(`/projects/${projectId}/geocode`);
      if (!coords) {
        setError(t("detectFailed"));
        return;
      }
      setForm((f) => ({ ...f, lat: coords.lat.toString(), lng: coords.lon.toString() }));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/projects/${projectId}/geofence`, {
        method: "PATCH",
        body: JSON.stringify({ lat: Number(form.lat), lng: Number(form.lng), radiusMeters: Number(form.radiusMeters) }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function clearGeofence() {
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/geofence`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!project) return null;
  const isSet = project.geofenceLat !== null;

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {isSet && (
        <p className="mb-2 text-xs text-success-700">
          {t("activeSummary", { lat: project.geofenceLat!.toFixed(5), lng: project.geofenceLng!.toFixed(5), radius: project.geofenceRadiusMeters! })}
        </p>
      )}

      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}

      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("lat")}
          <input
            type="number"
            step="any"
            required
            className="input w-32"
            value={form.lat}
            onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("lng")}
          <input
            type="number"
            step="any"
            required
            className="input w-32"
            value={form.lng}
            onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          {t("radiusMeters")}
          <input
            type="number"
            min="10"
            max="5000"
            required
            className="input w-24"
            value={form.radiusMeters}
            onChange={(e) => setForm((f) => ({ ...f, radiusMeters: e.target.value }))}
          />
        </label>
        <button type="button" onClick={detectFromAddress} disabled={busy} className="btn-secondary">
          {t("detectFromAddress")}
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {tc("save")}
        </button>
        {isSet && (
          <button type="button" onClick={clearGeofence} disabled={busy} className="btn-secondary">
            {t("clear")}
          </button>
        )}
      </form>
    </div>
  );
}
