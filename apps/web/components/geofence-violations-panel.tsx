"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Violation {
  id: string;
  date: string;
  workerName: string;
  projectName: string;
  hours: number;
  distanceFromSiteMeters: number | null;
}

export function GeofenceViolationsPanel() {
  const t = useTranslations("geofenceViolations");
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [violationsError, setViolationsError] = useState<Error | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    const query = new URLSearchParams();
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    apiFetch<Violation[]>(`/reports/geofence-violations?${query.toString()}`).then((result) => {
      setViolationsError(null);
      setViolations(result);
    }).catch(setViolationsError);
  }

  useEffect(load, []);

  async function exportCsv() {
    setBusy(true);
    try {
      const query = new URLSearchParams();
      if (from) query.set("from", new Date(from).toISOString());
      if (to) query.set("to", new Date(to).toISOString());
      const blob = await apiFetch<Blob>(`/reports/geofence-violations/csv?${query.toString()}`);
      downloadBlob(blob, "geofence-violations.csv");
    } finally {
      setBusy(false);
    }
  }

  if (violations === null) return violationsError ? <ErrorState error={violationsError} onRetry={load} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <div className="card">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("from")}
            <input type="date" className="input py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("to")}
            <input type="date" className="input py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={load} className="btn-secondary px-2 py-1 text-xs">
            {t("filter")}
          </button>
          <button onClick={exportCsv} disabled={busy} className="btn-secondary ml-auto px-2 py-1 text-xs">
            {t("exportCsv")}
          </button>
        </div>

        {violations.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                <th className="py-1.5">{t("date")}</th>
                <th>{t("worker")}</th>
                <th>{t("project")}</th>
                <th>{t("hours")}</th>
                <th>{t("distance")}</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-1.5 text-xs text-fg-subtle">{v.date.slice(0, 10)}</td>
                  <td>{v.workerName}</td>
                  <td className="text-xs text-fg-subtle">{v.projectName}</td>
                  <td>{v.hours}</td>
                  <td className="text-xs text-fg-subtle">{v.distanceFromSiteMeters !== null ? `${v.distanceFromSiteMeters} m` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
