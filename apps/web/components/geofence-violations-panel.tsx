"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    const query = new URLSearchParams();
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    apiFetch<Violation[]>(`/reports/geofence-violations?${query.toString()}`).then(setViolations);
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

  if (violations === null) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <div className="card">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("from")}
            <input type="date" className="input py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
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
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
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
                  <td className="py-1.5 text-xs text-gray-500 dark:text-gray-400">{v.date.slice(0, 10)}</td>
                  <td>{v.workerName}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{v.projectName}</td>
                  <td>{v.hours}</td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">{v.distanceFromSiteMeters !== null ? `${v.distanceFromSiteMeters} m` : "—"}</td>
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
