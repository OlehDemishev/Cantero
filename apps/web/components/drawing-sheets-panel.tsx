"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DrawingSetImport } from "@/components/drawing-set-import";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormError } from "@/components/ui/field";

interface DrawingSheet {
  id: string;
  sheetNumber: string;
  discipline: string | null;
  title: string | null;
  revision: string | null;
  mimeType: string;
}

export function DrawingSheetsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("drawings");
  const confirm = useConfirm();
  const tc = useTranslations("common");

  const { data: sheets = null, reload: reloadSheets, error: sheetsError } = useApi<DrawingSheet[]>(`/projects/${projectId}/drawing-sheets`);
  const [form, setForm] = useState({ sheetNumber: "", discipline: "", title: "", revision: "" });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetFileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    void reloadSheets();
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const input = document.getElementById("drawing-sheet-file-input") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !form.sheetNumber.trim()) return;

    setUploading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sheetNumber: form.sheetNumber });
      if (form.discipline) params.set("discipline", form.discipline);
      if (form.title) params.set("title", form.title);
      if (form.revision) params.set("revision", form.revision);

      await apiUpload(`/projects/${projectId}/drawing-sheets?${params.toString()}`, file);

      setForm({ sheetNumber: "", discipline: "", title: "", revision: "" });
      if (input) input.value = "";
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: t("confirmDeleteSheet"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/drawing-sheets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-fg-muted">{t("title")}</h2>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      <DrawingSetImport projectId={projectId} onImported={load} />

      {!sheets ? (
        sheetsError ? <ErrorState error={sheetsError} onRetry={reloadSheets} compact /> : <Skeleton lines={3} />
      ) : sheets.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noSheets")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {sheets.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <a href={`/drawings/${s.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                {s.sheetNumber} {s.title && `— ${s.title}`} {s.discipline && <span className="text-fg-subtle">({s.discipline})</span>}
                {s.revision && <span className="text-fg-subtle"> · {t("revision")} {s.revision}</span>}
              </a>
              <button onClick={() => remove(s.id)} className="text-fg-subtle hover:text-danger-fg">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-gray-100 pt-3 text-xs text-fg-subtle dark:border-gray-800">{t("singleSheetHint")}</p>
      <form onSubmit={upload} className="mt-1 flex flex-wrap items-end gap-2">
        <input required placeholder={t("sheetNumberPlaceholder")} className="input w-32" value={form.sheetNumber} onChange={(e) => setForm((f) => ({ ...f, sheetNumber: e.target.value }))} />
        <input placeholder={t("disciplinePlaceholder")} className="input w-32" value={form.discipline} onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))} />
        <input placeholder={t("titlePlaceholder")} className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <input placeholder={t("revisionPlaceholder")} className="input w-24" value={form.revision} onChange={(e) => setForm((f) => ({ ...f, revision: e.target.value }))} />
        <input
          id="drawing-sheet-file-input"
          ref={sheetFileInputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => sheetFileInputRef.current?.click()}
          className="btn-secondary shrink-0"
        >
          {tc("chooseFile")}
        </button>
        <button type="submit" disabled={uploading} className="btn-secondary shrink-0">
          {tc("save")}
        </button>
      </form>
      {error && <FormError className="mt-2">{error}</FormError>}
    </div>
  );
}
