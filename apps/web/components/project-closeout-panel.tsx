"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

interface CloseoutReadiness {
  asBuiltCount: number;
  omManualCount: number;
  openPunchList: number;
  openRfis: number;
  openWarrantyClaims: number;
  ready: boolean;
  missing: string[];
}

export function ProjectCloseoutPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("closeout");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSent, setReviewSent] = useState(false);
  const [npsBusy, setNpsBusy] = useState(false);
  const [npsError, setNpsError] = useState<string | null>(null);
  const [npsSent, setNpsSent] = useState(false);
  const [readiness, setReadiness] = useState<CloseoutReadiness | null>(null);

  useEffect(() => {
    apiFetch<CloseoutReadiness>(`/projects/${projectId}/closeout-readiness`).then(setReadiness);
  }, [projectId]);

  async function download() {
    setBusy(true);
    setError(false);
    try {
      const blob = await apiFetch<Blob>(`/projects/${projectId}/closeout-package`);
      downloadBlob(blob, "closeout-package.zip");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function requestReview() {
    setReviewBusy(true);
    setReviewError(null);
    try {
      await apiFetch(`/projects/${projectId}/request-review`, { method: "POST" });
      setReviewSent(true);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : t("reviewError"));
    } finally {
      setReviewBusy(false);
    }
  }

  async function sendNpsSurvey() {
    setNpsBusy(true);
    setNpsError(null);
    try {
      await apiFetch(`/projects/${projectId}/nps-survey`, { method: "POST" });
      setNpsSent(true);
    } catch (err) {
      setNpsError(err instanceof Error ? err.message : t("npsError"));
    } finally {
      setNpsBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>

      {readiness && (
        <div className="card mb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("readinessTitle")}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                readiness.ready ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500" : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500"
              }`}
            >
              {readiness.ready ? t("readinessReady") : t("readinessNotReady")}
            </span>
          </div>
          {!readiness.ready && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {readiness.missing.map((key) => (
                <li key={key} className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                  {t(`missing_${key}`)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("readinessCounts", { asBuilt: readiness.asBuiltCount, omManual: readiness.omManualCount })}
          </p>
        </div>
      )}

      <div className="card flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("description")}</p>
        <button onClick={download} disabled={busy} className="btn-secondary shrink-0">
          {busy ? t("preparing") : t("download")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error-700 dark:text-error-500">{t("error")}</p>}

      <div className="card mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("reviewDescription")}</p>
        <button onClick={requestReview} disabled={reviewBusy || reviewSent} className="btn-secondary shrink-0">
          {reviewSent ? t("reviewSent") : t("requestReview")}
        </button>
      </div>
      {reviewError && <p className="mt-2 text-xs text-error-700 dark:text-error-500">{reviewError}</p>}

      <div className="card mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("npsDescription")}</p>
        <button onClick={sendNpsSurvey} disabled={npsBusy || npsSent} className="btn-secondary shrink-0">
          {npsSent ? t("npsSent") : t("sendNps")}
        </button>
      </div>
      {npsError && <p className="mt-2 text-xs text-error-700 dark:text-error-500">{npsError}</p>}
    </div>
  );
}
