"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/field";

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
  const { data: readiness = null } = useApi<CloseoutReadiness>(`/projects/${projectId}/closeout-readiness`);

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
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">{t("title")}</h2>

      {readiness && (
        <div className="card mb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg-muted">{t("readinessTitle")}</span>
            <Badge tone={readiness.ready ? "success" : "warning"}>
              {readiness.ready ? t("readinessReady") : t("readinessNotReady")}
            </Badge>
          </div>
          {!readiness.ready && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {readiness.missing.map((key) => (
                <li key={key}>
                  <Badge>{t(`missing_${key}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-fg-subtle">
            {t("readinessCounts", { asBuilt: readiness.asBuiltCount, omManual: readiness.omManualCount })}
          </p>
        </div>
      )}

      <div className="card flex items-center justify-between gap-4">
        <p className="text-sm text-fg-subtle">{t("description")}</p>
        <button onClick={download} disabled={busy} className="btn-secondary shrink-0">
          {busy ? t("preparing") : t("download")}
        </button>
      </div>
      {error && <FormError className="mt-2">{t("error")}</FormError>}

      <div className="card mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-fg-subtle">{t("reviewDescription")}</p>
        <button onClick={requestReview} disabled={reviewBusy || reviewSent} className="btn-secondary shrink-0">
          {reviewSent ? t("reviewSent") : t("requestReview")}
        </button>
      </div>
      {reviewError && <FormError className="mt-2">{reviewError}</FormError>}

      <div className="card mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-fg-subtle">{t("npsDescription")}</p>
        <button onClick={sendNpsSurvey} disabled={npsBusy || npsSent} className="btn-secondary shrink-0">
          {npsSent ? t("npsSent") : t("sendNps")}
        </button>
      </div>
      {npsError && <FormError className="mt-2">{npsError}</FormError>}
    </div>
  );
}
