"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload, downloadBlob } from "@/lib/api-client";

interface ImportSummary {
  format: "mspdi" | "xer";
  tasksCreated: number;
  milestonesCreated: number;
  dependenciesCreated: number;
  dependenciesSkipped: number;
}

/** File-based exchange with desktop MS Project (XML) and Primavera P6 (XER) — no account or
 * connector needed, unlike the cloud-only MsProjectSyncPanel. See ScheduleFilesService. */
export function ScheduleFilesPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduleFiles");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiUpload<ImportSummary>(`/schedule-files/import?projectId=${projectId}`, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importFailed"));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function exportFile(format: "mspdi" | "xer") {
    setError(null);
    try {
      const blob = await apiFetch<Blob>(`/schedule-files/export?projectId=${projectId}&format=${format}`);
      downloadBlob(blob, format === "xer" ? "schedule.xer" : "schedule.xml");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exportFailed"));
    }
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <label className="mb-3 flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{t("importLabel")}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.xer"
          disabled={busy}
          className="input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
        />
      </label>
      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}
      {result && (
        <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
          {t("importResult", {
            tasks: result.tasksCreated,
            milestones: result.milestonesCreated,
            dependencies: result.dependenciesCreated,
            skipped: result.dependenciesSkipped,
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => exportFile("mspdi")} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("exportMspdi")}
        </button>
        <button onClick={() => exportFile("xer")} className="btn-secondary px-2.5 py-1.5 text-xs">
          {t("exportXer")}
        </button>
      </div>
    </section>
  );
}
