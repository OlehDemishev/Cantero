"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";

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
  const tc = useTranslations("common");

  const [sheets, setSheets] = useState<DrawingSheet[] | null>(null);
  const [form, setForm] = useState({ sheetNumber: "", discipline: "", title: "", revision: "" });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<DrawingSheet[]>(`/projects/${projectId}/drawing-sheets`).then(setSheets);
  }

  useEffect(load, [projectId]);

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
    if (!window.confirm(t("confirmDeleteSheet"))) return;
    await apiFetch(`/drawing-sheets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      {!sheets ? (
        <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : sheets.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noSheets")}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-1.5">
          {sheets.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <a href={`/drawings/${s.id}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                {s.sheetNumber} {s.title && `— ${s.title}`} {s.discipline && <span className="text-gray-400 dark:text-gray-500">({s.discipline})</span>}
                {s.revision && <span className="text-gray-400 dark:text-gray-500"> · {t("revision")} {s.revision}</span>}
              </a>
              <button onClick={() => remove(s.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={upload} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <input required placeholder={t("sheetNumberPlaceholder")} className="input w-32" value={form.sheetNumber} onChange={(e) => setForm((f) => ({ ...f, sheetNumber: e.target.value }))} />
        <input placeholder={t("disciplinePlaceholder")} className="input w-32" value={form.discipline} onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))} />
        <input placeholder={t("titlePlaceholder")} className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <input placeholder={t("revisionPlaceholder")} className="input w-24" value={form.revision} onChange={(e) => setForm((f) => ({ ...f, revision: e.target.value }))} />
        <input id="drawing-sheet-file-input" type="file" accept="application/pdf,image/*" className="text-xs" />
        <button type="submit" disabled={uploading} className="btn-secondary shrink-0">
          {tc("save")}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}
    </div>
  );
}
