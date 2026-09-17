"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/** Project-scoped push of punch list items to a connected Autodesk Construction Cloud project as
 * Issues — see AutodeskService. Company-level connect/disconnect lives in Settings →
 * Integrations, same split as MsProjectSyncPanel/AccountingSyncPanel. */
export function AutodeskSyncPanel({ projectId, initialAutodeskProjectId }: { projectId: string; initialAutodeskProjectId: string | null }) {
  const t = useTranslations("autodesk");

  const [autodeskProjectId, setAutodeskProjectId] = useState(initialAutodeskProjectId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncSummary | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const summary = await apiFetch<SyncSummary>(`/projects/${projectId}/sync-autodesk`, {
        method: "POST",
        body: JSON.stringify({ autodeskProjectId }),
      });
      setResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("syncFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>
      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}
      {result && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
          {t("syncResult", { synced: result.synced, failed: result.failed })}
          {result.errors.length > 0 && <span className="mt-1 block text-error-600">{result.errors.slice(0, 3).join("; ")}</span>}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{t("accProjectIdLabel")}</span>
          <input
            className="input"
            placeholder={t("accProjectIdPlaceholder")}
            value={autodeskProjectId}
            onChange={(e) => setAutodeskProjectId(e.target.value)}
          />
        </label>
        <button onClick={sync} disabled={busy || autodeskProjectId.trim().length === 0} className="btn-secondary">
          {t("syncNow")}
        </button>
      </div>
    </section>
  );
}
