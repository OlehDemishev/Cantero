"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { FormError } from "@/components/ui/field";

interface SyncSummary {
  synced: number;
  failed: number;
  errors: string[];
}

/** Project-scoped push to a connected "Project for the Web" environment — see MsProjectService.
 * Company-level connect/disconnect lives in Settings → Integrations, same split as
 * AccountingSyncPanel (company-wide connection) vs this (per-project action). */
export function MsProjectSyncPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("msProject");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncSummary | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const summary = await apiFetch<SyncSummary>(`/projects/${projectId}/sync-ms-project`, { method: "POST" });
      setResult(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("syncFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>
      {error && <FormError className="mb-2">{error}</FormError>}
      {result && (
        <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
          {t("syncResult", { synced: result.synced, failed: result.failed })}
          {result.errors.length > 0 && <span className="mt-1 block text-danger-fg">{result.errors.slice(0, 3).join("; ")}</span>}
        </p>
      )}
      <button onClick={sync} disabled={busy} className="btn-secondary">
        {t("syncNow")}
      </button>
    </section>
  );
}
