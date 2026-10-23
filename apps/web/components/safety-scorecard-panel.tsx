"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors, chartAxisProps, chartGridProps, chartTooltipProps } from "@/components/charts/chart-theme";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { useCan } from "@/lib/permissions";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

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
  const ta = useTranslations("a11y");

  const [year, setYear] = useState(CURRENT_YEAR);
  const canSee = useCan()("site.manage");
  const { data: scorecard, error: scorecardError, reload: reloadScorecard } = useApi<SafetyScorecard>(
    canSee ? `/safety/analytics/scorecard?year=${year}` : null,
  );
  const [exporting, setExporting] = useState(false);
  const { data: training = null } = useApi<TrainingCompliance>(canSee ? "/safety/analytics/training-compliance" : null);
  const { data: nearMiss } = useApi<NearMissAnalytics>(canSee ? `/safety/analytics/near-miss?year=${year}` : null);

  async function downloadOsha300a() {
    setExporting(true);
    try {
      const blob = await apiFetch<Blob>(`/safety/analytics/osha-300a/pdf?year=${year}`);
      downloadBlob(blob, `osha-300a-summary-${year}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  if (!canSee) return null;

  return (
    <div className="mt-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">{t("safetyScorecard")}</h2>
        <div className="flex items-center gap-2">
          <select aria-label={ta("year")} className="input w-auto py-1 text-xs" value={year} onChange={(e) => setYear(Number(e.target.value))}>
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
      <p className="mb-3 text-xs text-fg-subtle">{t("safetyScorecardHint")}</p>

      {!scorecard ? (
        scorecardError ? <ErrorState error={scorecardError} onRetry={reloadScorecard} compact /> : <Skeleton variant="block" height="h-40" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("companyTrir")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{scorecard.companyTrir ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("totalIncidents")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{scorecard.totalIncidents}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("recordableCases")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-fg">{scorecard.recordableCount}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("totalHoursWorked")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{scorecard.totalHours}</div>
            </div>
          </div>

          <div className="card mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scorecard.monthlyTrend}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="month" {...chartAxisProps} />
                <YAxis allowDecimals={false} {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} />
                <Bar dataKey="totalIncidents" name={t("totalIncidents")} fill={chartColors.warning} radius={[4, 4, 0, 0]} />
                <Bar dataKey="recordableCount" name={t("recordableCases")} fill={chartColors.danger} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {scorecard.projects.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
          <h3 className="mb-1 text-sm font-semibold text-fg-muted">{t("nearMissAnalytics")}</h3>
          <p className="mb-3 text-xs text-fg-subtle">{t("nearMissAnalyticsHint")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("totalNearMiss")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{nearMiss.totalNearMiss}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("recordableCases")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-fg">{nearMiss.totalRecordable}</div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("nearMissRatio")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">{nearMiss.ratio ?? "—"}</div>
            </div>
          </div>

          {nearMiss.projects.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
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
          <h3 className="mb-1 text-sm font-semibold text-fg-muted">{t("trainingCompliance")}</h3>
          <p className="mb-3 text-xs text-fg-subtle">{t("trainingComplianceHint", { days: training.lookbackDays })}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("completionRate")}</div>
              <div className="mt-1 text-lg font-semibold text-fg">
                {training.completionRate !== null ? `${training.completionRate}%` : "—"}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("compliantWorkers")}</div>
              <div className="mt-1 text-lg font-semibold text-success-fg">
                {training.compliantCount} / {training.totalActiveWorkers}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-fg-subtle">{t("overdueWorkers")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-fg">{training.overdueWorkers.length}</div>
            </div>
          </div>

          {training.overdueWorkers.length > 0 && (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-fg-subtle">
                  <th className="py-2">{t("worker")}</th>
                  <th className="text-right">{t("lastTrainingAt")}</th>
                </tr>
              </thead>
              <tbody>
                {training.overdueWorkers.map((w) => (
                  <tr key={w.workerId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{w.workerName}</td>
                    <td className="text-right text-warning-fg">
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
