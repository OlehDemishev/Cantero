"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, downloadBlob } from "@/lib/api-client";

export function ProjectCloseoutPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("closeout");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

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

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <div className="card flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{t("description")}</p>
        <button onClick={download} disabled={busy} className="btn-secondary shrink-0">
          {busy ? t("preparing") : t("download")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error-700">{t("error")}</p>}
    </div>
  );
}
