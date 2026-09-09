"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

interface ProjectSafetyRow {
  projectId: string;
  projectName: string | null;
  totalIncidents: number;
  recordableCount: number;
  hoursWorked: number;
  trir: number | null;
}
interface SafetyScorecard {
  year: number;
  companyTrir: number | null;
  totalHours: number;
  totalIncidents: number;
  recordableCount: number;
  projects: ProjectSafetyRow[];
  monthlyTrend: { month: number; totalIncidents: number; recordableCount: number }[];
}
interface OverdueWorker {
  workerId: string;
  workerName: string;
  lastTrainingAt: string | null;
  overdue: boolean;
}
interface TrainingCompliance {
  lookbackDays: number;
  totalActiveWorkers: number;
  compliantCount: number;
  completionRate: number | null;
  overdueWorkers: OverdueWorker[];
}
interface NearMissProjectRow {
  projectId: string;
  projectName: string;
  nearMissCount: number;
  recordableCount: number;
  ratio: number | null;
}
interface NearMissAnalytics {
  year: number;
  totalNearMiss: number;
  totalRecordable: number;
  ratio: number | null;
  monthlyTrend: { month: number; nearMissCount: number; recordableCount: number }[];
  projects: NearMissProjectRow[];
}

const CURRENT_YEAR = new Date().getFullYear();

export function SafetyScorecardPanel() {
  const t = useTranslations("sustainability");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [scorecard, setScorecard] = useState<SafetyScorecard | null>(null);
  const [exporting, setExporting] = useState(false);
  const [training, setTraining] = useState<TrainingCompliance | null>(null);
  const [nearMiss, setNearMiss] = useState<NearMissAnalytics | null>(null);

  useEffect(() => {
    resetStateInEffect(() => {
      setScorecard(null);
      setNearMiss(null);
    });
    apiFetch<SafetyScorecard>(`/safety/analytics/scorecard?year=${year}`).then(setScorecard);
    apiFetch<NearMissAnalytics>(`/safety/analytics/near-miss?year=${year}`).then(setNearMiss);
  }, [year]);

  useEffect(() => {
    apiFetch<TrainingCompliance>("/safety/analytics/training-compliance").then(setTraining);
  }, []);

  async function downloadOsha300a() {
    setExporting(true);
    try {
      const blob = await apiFetch<Blob>(`/safety/analytics/osha-300a/pdf?year=${year}`);
      downloadBlob(blob, `osha-300a-summary-${year}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("safetyScorecard")}</h2>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1 text-xs" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button onClick={downloadOsha300a} disabled={exporting} className="btn-secondary px-3 py-1 text-xs">
            {t("downloadOsha300a")}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("safetyScorecardHint")}</p>

      {!scorecard ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("companyTrir")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{scorecard.companyTrir ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalIncidents")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{scorecard.totalIncidents}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("recordableCases")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-700 dark:text-warning-500">{scorecard.recordableCount}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalHoursWorked")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{scorecard.totalHours}</div>
            </div>
          </div>

          <div className="card mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scorecard.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #e5e7eb)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="totalIncidents" name={t("totalIncidents")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recordableCount" name={t("recordableCases")} fill="#e7000b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {scorecard.projects.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("project")}</th>
                  <th className="text-right">{t("totalIncidents")}</th>
                  <th className="text-right">{t("recordableCases")}</th>
                  <th className="text-right">{t("hoursWorked")}</th>
                  <th className="text-right">{t("trir")}</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.projects.map((p) => (
                  <tr key={p.projectId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{p.projectName ?? "—"}</td>
                    <td className="text-right">{p.totalIncidents}</td>
                    <td className="text-right">{p.recordableCount}</td>
                    <td className="text-right">{p.hoursWorked}</td>
                    <td className="text-right font-medium">{p.trir ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}

      {nearMiss && (
        <div className="mt-8">
          <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("nearMissAnalytics")}</h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("nearMissAnalyticsHint")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("totalNearMiss")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{nearMiss.totalNearMiss}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("recordableCases")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-700 dark:text-warning-500">{nearMiss.totalRecordable}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("nearMissRatio")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">{nearMiss.ratio ?? "—"}</div>
            </div>
          </div>

          {nearMiss.projects.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("project")}</th>
                  <th className="text-right">{t("totalNearMiss")}</th>
                  <th className="text-right">{t("recordableCases")}</th>
                  <th className="text-right">{t("nearMissRatio")}</th>
                </tr>
              </thead>
              <tbody>
                {nearMiss.projects.map((p) => (
                  <tr key={p.projectId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{p.projectName}</td>
                    <td className="text-right">{p.nearMissCount}</td>
                    <td className="text-right">{p.recordableCount}</td>
                    <td className="text-right font-medium">{p.ratio ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {training && (
        <div className="mt-8">
          <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("trainingCompliance")}</h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("trainingComplianceHint", { days: training.lookbackDays })}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("completionRate")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50">
                {training.completionRate !== null ? `${training.completionRate}%` : "—"}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("compliantWorkers")}</div>
              <div className="mt-1 text-lg font-semibold text-success-700 dark:text-success-500">
                {training.compliantCount} / {training.totalActiveWorkers}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t("overdueWorkers")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-700 dark:text-warning-500">{training.overdueWorkers.length}</div>
            </div>
          </div>

          {training.overdueWorkers.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">{t("worker")}</th>
                  <th className="text-right">{t("lastTrainingAt")}</th>
                </tr>
              </thead>
              <tbody>
                {training.overdueWorkers.map((w) => (
                  <tr key={w.workerId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{w.workerName}</td>
                    <td className="text-right text-warning-700 dark:text-warning-500">
                      {w.lastTrainingAt ? formatDate(new Date(w.lastTrainingAt)) : t("neverTrained")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
