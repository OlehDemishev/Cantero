"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { WeatherCondition } from "@cantero/shared";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface WeatherDelayEntry {
  id: string;
  date: string;
  weatherCondition: WeatherCondition | null;
  weatherDelayHours: number;
  weatherNotes: string | null;
}
interface WeatherDelayReport {
  entries: WeatherDelayEntry[];
  totalHours: number;
  suggestedShiftDays: number;
}

export function WeatherDelayReportPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("dailyLogs");

  const [report, setReport] = useState<WeatherDelayReport | null>(null);
  const [shiftDays, setShiftDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [shiftResult, setShiftResult] = useState<{ shiftedTasks: number; shiftedMilestones: number } | null>(null);

  function load() {
    apiFetch<WeatherDelayReport>(`/daily-logs/weather-delay-report?projectId=${projectId}`).then((r) => {
      setReport(r);
      setShiftDays(r.suggestedShiftDays > 0 ? String(r.suggestedShiftDays) : "");
    });
  }

  useEffect(load, [projectId]);

  async function exportCsv() {
    const blob = await apiFetch<Blob>(`/daily-logs/weather-delay-report/export?projectId=${projectId}`);
    downloadBlob(blob, "weather-delay-report.csv");
  }

  async function shiftSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftDays) return;
    setBusy(true);
    setShiftResult(null);
    try {
      const result = await apiFetch<{ shiftedTasks: number; shiftedMilestones: number }>(
        `/tasks/shift-schedule?projectId=${projectId}`,
        { method: "POST", body: JSON.stringify({ days: Number(shiftDays) }) },
      );
      setShiftResult(result);
    } finally {
      setBusy(false);
    }
  }

  if (!report || report.entries.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("weatherDelayReport")}</h2>
      <div className="card">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {t("weatherDelayTotal", { hours: report.totalHours, days: report.suggestedShiftDays })}
        </p>
        <div className="overflow-x-auto">
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="py-1.5">{t("date")}</th>
              <th>{t("weather")}</th>
              <th>{t("weatherDelayHours")}</th>
              <th>{t("weatherNotes")}</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5">{formatDate(new Date(e.date))}</td>
                <td>{e.weatherCondition ? t(`weather_${e.weatherCondition}`) : "—"}</td>
                <td>{e.weatherDelayHours}</td>
                <td className="text-gray-500 dark:text-gray-400">{e.weatherNotes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={exportCsv} className="btn-secondary px-3 py-1 text-xs">
            {t("exportWeatherDelayReport")}
          </button>
        </div>

        <form onSubmit={shiftSchedule} className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {t("shiftScheduleDays")}
            <input
              type="number"
              min="1"
              max="365"
              className="input w-24"
              value={shiftDays}
              onChange={(e) => setShiftDays(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !shiftDays} className="btn-primary px-3 py-1 text-xs">
            {t("shiftSchedule")}
          </button>
          {shiftResult && (
            <span className="text-xs text-success-700 dark:text-success-500">
              {t("shiftScheduleResult", { tasks: shiftResult.shiftedTasks, milestones: shiftResult.shiftedMilestones })}
            </span>
          )}
        </form>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("shiftScheduleHint")}</p>
      </div>
    </div>
  );
}
