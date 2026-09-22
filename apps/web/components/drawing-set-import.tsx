"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { loadPdf, renderPage } from "@/lib/pdf";

interface SetPage {
  page: number;
  sheetNumber: string | null;
  title: string | null;
  discipline: string | null;
  confidence: "high" | "medium" | null;
  /** Read by OCR from a scanned page's title block. */
  fromScan?: boolean;
  referenceCount: number;
  existingSheet: { id: string; sheetNumber: string; revision: string | null; version: number } | null;
}
interface DrawingSet {
  id: string;
  fileName: string;
  pageCount: number;
  pages: SetPage[];
}
interface Row {
  page: number;
  include: boolean;
  sheetNumber: string;
  title: string;
  discipline: string;
  revision: string;
}

const key = (n: string) => n.toUpperCase().replace(/[\s._-]/g, "");

/**
 * Upload a whole drawing set as one PDF: every page's sheet number, title and discipline are read
 * from its title block and shown here for review before anything is created. A number that already
 * exists in the project comes in as that sheet's next revision.
 */
export function DrawingSetImport({ projectId, onImported }: { projectId: string; onImported: () => void }) {
  const t = useTranslations("drawingSets");
  const fileRef = useRef<HTMLInputElement>(null);

  const [set, setSet] = useState<DrawingSet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<"upload" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; revised: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    setResult(null);
    try {
      const analyzed = await apiUpload<DrawingSet>(`/projects/${projectId}/drawing-sets`, file);
      setSet(analyzed);
      setRows(
        analyzed.pages.map((p) => ({
          page: p.page,
          include: Boolean(p.sheetNumber),
          sheetNumber: p.sheetNumber ?? "",
          title: p.title ?? "",
          discipline: p.discipline ?? "",
          revision: "",
        })),
      );
      setPreview(analyzed.pages.find((p) => !p.sheetNumber)?.page ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const update = (page: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.page === page ? { ...r, ...patch } : r)));

  const included = rows.filter((r) => r.include);
  const counts = new Map<string, number>();
  for (const r of included) if (r.sheetNumber.trim()) counts.set(key(r.sheetNumber), (counts.get(key(r.sheetNumber)) ?? 0) + 1);
  const problem = (r: Row) => (!r.include ? null : !r.sheetNumber.trim() ? t("needsNumber") : (counts.get(key(r.sheetNumber)) ?? 0) > 1 ? t("duplicateNumber") : null);
  const blocked = included.length === 0 || included.some((r) => problem(r));

  async function doImport() {
    if (!set || blocked) return;
    setBusy("import");
    setError(null);
    try {
      const res = await apiFetch<{ created: number; revised: number }>(`/drawing-sets/${set.id}/import`, {
        method: "POST",
        body: JSON.stringify({
          pages: included.map((r) => ({
            page: r.page,
            sheetNumber: r.sheetNumber.trim(),
            ...(r.title.trim() ? { title: r.title.trim() } : {}),
            ...(r.discipline.trim() ? { discipline: r.discipline.trim() } : {}),
            ...(r.revision.trim() ? { revision: r.revision.trim() } : {}),
          })),
        }),
      });
      setResult(res);
      setSet(null);
      setRows([]);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!set) return;
    await apiFetch(`/drawing-sets/${set.id}`, { method: "DELETE" }).catch(() => undefined);
    setSet(null);
    setRows([]);
  }

  if (!set) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null} className="btn-primary">
          {busy === "upload" ? t("reading") : t("uploadSet")}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">{t("uploadHint")}</span>
        {result && <p className="basis-full text-xs text-success-600">{t("imported", result)}</p>}
        {error && <p className="basis-full text-xs text-error-600">{error}</p>}
      </div>
    );
  }

  const recognized = set.pages.filter((p) => p.sheetNumber).length;

  return (
    <section className="mb-5 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("reviewTitle", { file: set.fileName })}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("reviewSummary", { pages: set.pageCount, recognized })}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={discard} className="btn-secondary">
            {t("discard")}
          </button>
          <button type="button" onClick={doImport} disabled={blocked || busy !== null} className="btn-primary">
            {busy === "import" ? t("importing") : t("importN", { n: included.length })}
          </button>
        </div>
      </div>
      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}

      {preview !== null && <PagePreview setId={set.id} page={preview} onClose={() => setPreview(null)} />}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
              <th className="w-8 py-1" />
              <th className="w-14 py-1 font-medium">{t("page")}</th>
              <th className="py-1 font-medium">{t("sheetNumber")}</th>
              <th className="py-1 font-medium">{t("sheetTitle")}</th>
              <th className="py-1 font-medium">{t("discipline")}</th>
              <th className="w-20 py-1 font-medium">{t("revision")}</th>
              <th className="py-1 font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const p = set.pages.find((x) => x.page === r.page)!;
              const issue = problem(r);
              // The existing match is for the recognized number; re-check against what's typed now.
              const revises = p.existingSheet && key(p.existingSheet.sheetNumber) === key(r.sheetNumber) ? p.existingSheet : null;
              return (
                <tr key={r.page} className={r.include ? "" : "opacity-60"}>
                  <td className="py-1.5">
                    <input type="checkbox" checked={r.include} onChange={(e) => update(r.page, { include: e.target.checked })} aria-label={t("includePage", { n: r.page })} />
                  </td>
                  <td className="py-1.5">
                    <button type="button" onClick={() => setPreview(r.page)} className={`tabular-nums hover:underline ${preview === r.page ? "font-semibold text-brand-700 dark:text-brand-400" : "text-gray-600 dark:text-gray-300"}`}>
                      {r.page}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={t("fieldOnPage", { field: t("sheetNumber"), n: r.page })} className={`input w-28 py-1 font-mono text-xs ${issue ? "border-error-500" : ""}`} value={r.sheetNumber} onChange={(e) => update(r.page, { sheetNumber: e.target.value, include: true })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={t("fieldOnPage", { field: t("sheetTitle"), n: r.page })} className="input w-full min-w-40 py-1 text-xs" value={r.title} onChange={(e) => update(r.page, { title: e.target.value })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={t("fieldOnPage", { field: t("discipline"), n: r.page })} className="input w-32 py-1 text-xs" value={r.discipline} onChange={(e) => update(r.page, { discipline: e.target.value })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={t("fieldOnPage", { field: t("revision"), n: r.page })} className="input w-16 py-1 text-xs" value={r.revision} placeholder={revises?.revision ? t("after", { rev: revises.revision }) : ""} onChange={(e) => update(r.page, { revision: e.target.value })} />
                  </td>
                  <td className="py-1.5 text-xs">
                    {issue ? (
                      <span className="text-error-600">{issue}</span>
                    ) : !r.include ? (
                      <span className="text-gray-400">{p.sheetNumber ? t("skipped") : t("notRecognized")}</span>
                    ) : revises ? (
                      <span className="rounded bg-warning-50 px-1.5 py-0.5 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">{t("revises", { sheet: revises.sheetNumber, version: revises.version + 1 })}</span>
                    ) : p.fromScan && key(p.sheetNumber ?? "") === key(r.sheetNumber) ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t("fromScan")}</span>
                    ) : p.confidence === "medium" && key(p.sheetNumber ?? "") === key(r.sheetNumber) ? (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t("checkIt")}</span>
                    ) : (
                      <span className="text-success-600">{t("newSheet")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One page of the uploaded set, so an unrecognized or doubtful page can be read before import. */
function PagePreview({ setId, page, onClose }: { setId: string; page: number; onClose: () => void }) {
  const t = useTranslations("drawingSets");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    apiFetch<Blob>(`/drawing-sets/${setId}/file`)
      .then((blob) => loadPdf(blob))
      .then((pdf) => {
        destroy = pdf.destroy;
        if (!cancelled) setDoc(pdf.doc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [setId]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let job: { cancel: () => void } | undefined;
    let cancelled = false;
    doc.getPage(page).then((p) => {
      if (cancelled || !canvasRef.current) return;
      const width = boxRef.current?.clientWidth ?? 720;
      job = renderPage(p, canvasRef.current, Math.min(width, 900) / p.getViewport({ scale: 1 }).width);
    });
    return () => {
      cancelled = true;
      job?.cancel();
    };
  }, [doc, page]);

  return (
    <div ref={boxRef} className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{t("previewPage", { n: page })}</span>
        <button type="button" onClick={onClose} className="hover:underline">
          {t("closePreview")}
        </button>
      </div>
      {!doc && <p className="p-4 text-xs text-gray-500 dark:text-gray-400">{t("loadingPreview")}</p>}
      <canvas ref={canvasRef} className="block max-w-full bg-white" />
    </div>
  );
}
