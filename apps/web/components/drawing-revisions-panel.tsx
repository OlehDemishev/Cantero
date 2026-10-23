"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiUpload } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/field";

interface DrawingSheetVersion {
  id: string;
  version: number;
  revision: string | null;
  revisionDate: string | null;
  createdAt: string;
}

export function DrawingRevisionsPanel({ sheetId, onSuperseded }: { sheetId: string; onSuperseded: (newSheetId: string) => void }) {
  const t = useTranslations("drawings");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");

  const { data: versions = null, error: versionsError, reload: reloadVersions } = useApi<DrawingSheetVersion[]>(`/drawing-sheets/${sheetId}/versions`);
  const [revision, setRevision] = useState("");
  const [revisionDate, setRevisionDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadRevision(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (revision) params.set("revision", revision);
      if (revisionDate) params.set("revisionDate", new Date(revisionDate).toISOString());
      const newSheet = await apiUpload<{ id: string }>(`/drawing-sheets/${sheetId}/supersede?${params.toString()}`, file);
      setRevision("");
      setRevisionDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuperseded(newSheet.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (versions === null) return versionsError ? <ErrorState error={versionsError} onRetry={reloadVersions} compact /> : <Skeleton lines={3} />;

  return (
    <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("revisionHistory")}</h3>
      {versions.length <= 1 ? (
        <p className="mb-3 text-xs text-fg-subtle">{t("noPriorRevisions")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2 text-xs text-fg-subtle">
              {i === 0 ? (
                <Badge tone="success">{t("current")}</Badge>
              ) : (
                <Badge tone="neutral">{t("superseded")}</Badge>
              )}
              <span>{t("revisionLabel", { n: v.version })}</span>
              {v.revision && <span>· {v.revision}</span>}
              <span>· {formatDate(new Date(v.createdAt))}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={uploadRevision} className="flex flex-wrap items-end gap-2">
        <input placeholder={t("revisionPlaceholder")} aria-label={t("revisionPlaceholder")} className="input w-24" value={revision} onChange={(e) => setRevision(e.target.value)} />
        <input aria-label={ta("revisionDate")} type="date" className="input" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} />
        <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary shrink-0">
          {tc("chooseFile")}
        </button>
        <button type="submit" disabled={uploading} className="btn-secondary shrink-0">
          {t("uploadRevision")}
        </button>
      </form>
      {error && <FormError className="mt-2">{error}</FormError>}
    </div>
  );
}
