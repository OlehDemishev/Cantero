"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

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

const CURRENT_YEAR = new Date().getFullYear();

export function SafetyScorecardPanel() {
  const t = useTranslations("sustainability");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [scorecard, setScorecard] = useState<SafetyScorecard | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setScorecard(null);
    apiFetch<SafetyScorecard>(`/safety/analytics/scorecard?year=${year}`).then(setScorecard);
  }, [year]);

  async function downloadOsha300a() {
    setExporting(true);
    try {
      const blob = await apiFetch<Blob>(`/safety/analytics/osha-300a/pdf?year=${year}`);
      downloadBlob(blob, `osha-300a-summary-${year}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const maxTrend = scorecard ? Math.max(...scorecard.monthlyTrend.map((m) => m.totalIncidents), 1) : 1;

  return (
    <div className="mt-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">{t("safetyScorecard")}</h2>
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
      <p className="mb-3 text-xs text-gray-500">{t("safetyScorecardHint")}</p>

      {!scorecard ? (
        <p className="text-sm text-gray-400">…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card">
              <div className="text-xs text-gray-500">{t("companyTrir")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{scorecard.companyTrir ?? "—"}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("totalIncidents")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{scorecard.totalIncidents}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("recordableCases")}</div>
              <div className="mt-1 text-lg font-semibold text-warning-700">{scorecard.recordableCount}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-500">{t("totalHoursWorked")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{scorecard.totalHours}</div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-end gap-2" style={{ minWidth: scorecard.monthlyTrend.length * 32 }}>
              {scorecard.monthlyTrend.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 items-end">
                    <div
                      className="w-4 rounded-t bg-warning-500"
                      style={{ height: `${(m.totalIncidents / maxTrend) * 100}%` }}
                      title={`${t("totalIncidents")}: ${m.totalIncidents}`}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{m.month}</span>
                </div>
              ))}
            </div>
          </div>

          {scorecard.projects.length > 0 && (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2">{t("project")}</th>
                  <th className="text-right">{t("totalIncidents")}</th>
                  <th className="text-right">{t("recordableCases")}</th>
                  <th className="text-right">{t("hoursWorked")}</th>
                  <th className="text-right">{t("trir")}</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.projects.map((p) => (
                  <tr key={p.projectId} className="border-b border-gray-100">
                    <td className="py-2">{p.projectName ?? "—"}</td>
                    <td className="text-right">{p.totalIncidents}</td>
                    <td className="text-right">{p.recordableCount}</td>
                    <td className="text-right">{p.hoursWorked}</td>
                    <td className="text-right font-medium">{p.trir ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
