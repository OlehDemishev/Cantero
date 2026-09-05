"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface ProgressEstimate {
  id: string;
  estimatedPercentComplete: number;
  matchedKeywords: string[];
  photoCount: number;
  billedPercentComplete: string | null;
  varianceFlagged: boolean;
  computedAt: string;
}

export function ProgressTrackingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("progressTracking");
  const tc = useTranslations("common");

  const [history, setHistory] = useState<ProgressEstimate[] | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<ProgressEstimate[]>(`/projects/${projectId}/progress-estimates`).then(setHistory);
  }
  useEffect(load, [projectId]);

  async function recompute() {
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/progress-estimates`, { method: "POST" });
      load();
    } finally {
      setBusy(false);
    }
  }

  const latest = history?.[0] ?? null;

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t("title")}</h2>
        <button onClick={recompute} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
          {t("recompute")}
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      {!history ? (
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      ) : !latest ? (
        <p className="text-sm text-gray-400">{t("noEstimates")}</p>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-semibold text-gray-900">{latest.estimatedPercentComplete}%</span>
            {latest.billedPercentComplete !== null && (
              <span className="text-sm text-gray-500">{t("billedPercent", { percent: Number(latest.billedPercentComplete).toFixed(0) })}</span>
            )}
          </div>
          {latest.varianceFlagged && <p className="mt-2 text-xs font-medium text-error-700">{t("varianceFlag")}</p>}
          <p className="mt-2 text-xs text-gray-400">
            {t("basedOnPhotos", { count: latest.photoCount })}
            {latest.matchedKeywords.length > 0 && ` — ${latest.matchedKeywords.join(", ")}`}
          </p>
          <p className="mt-1 text-xs text-gray-400">{new Date(latest.computedAt).toLocaleString()}</p>

          {history.length > 1 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("history")}</h3>
              <ul className="flex flex-col gap-1 text-xs text-gray-500">
                {history.slice(1).map((h) => (
                  <li key={h.id}>
                    {new Date(h.computedAt).toLocaleDateString()} — {h.estimatedPercentComplete}%
                    {h.billedPercentComplete !== null && ` (${t("billedPercent", { percent: Number(h.billedPercentComplete).toFixed(0) })})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
