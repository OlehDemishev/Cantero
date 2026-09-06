"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";

type AttachmentParam = "punchListItemId" | "dailyLogId" | "incidentReportId" | "warrantyClaimId" | "deficiencyId" | "rfiId";

interface DocumentSummary {
  id: string;
  name: string;
  mimeType: string;
  category: string;
}

const MARKUP_COLORS = ["#dc2626", "#f59e0b", "#16a34a", "#2563eb", "#000000"];

/** Reusable photo strip for the field modules — punch list items, daily logs, incidents, warranty
 * claims, QC deficiencies, RFIs — all attach through the same Document model via one of these id params.
 * Thumbnails are fetched as authenticated blobs and shown via object URLs, since a plain <img src>
 * can't carry the Authorization header the API requires. */
export function PhotoAttachments({
  param,
  entityId,
  beforeAfter = false,
}: {
  param: AttachmentParam;
  entityId: string;
  /** When true, uploads are tagged "before"/"after" (via two buttons instead of one) and the
   * gallery renders as two grouped columns — used for punch list items so a resolved defect's
   * fix can be shown side-by-side with the original condition. */
  beforeAfter?: boolean;
}) {
  const t = useTranslations("photos");

  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCategoryRef = useRef<"gallery_before" | "gallery_after" | "photo">("photo");
  const objectUrlsRef = useRef<string[]>([]);

  function load() {
    apiFetch<DocumentSummary[]>(`/documents?${param}=${entityId}`).then(setDocs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  useEffect(() => {
    if (!docs) return;
    let cancelled = false;
    Promise.all(
      docs
        .filter((d) => d.mimeType.startsWith("image/"))
        .map(async (d) => {
          const blob = await apiFetch<Blob>(`/documents/${d.id}/download`);
          return [d.id, URL.createObjectURL(blob)] as const;
        }),
    ).then((pairs) => {
      if (cancelled) return;
      const next = Object.fromEntries(pairs);
      setPreviews(next);
      objectUrlsRef.current = Object.values(next);
    });
    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
     
  }, [docs]);

  function triggerUpload(category: "gallery_before" | "gallery_after" | "photo") {
    uploadCategoryRef.current = category;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await apiUpload(`/documents?${param}=${entityId}&category=${uploadCategoryRef.current}`, file);
      load();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveMarkup(docId: string, blob: Blob) {
    setBusy(true);
    try {
      const file = new File([blob], "annotated.png", { type: "image/png" });
      await apiUpload(`/documents/${docId}/replace`, file);
      setViewingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  const viewingDoc = docs?.find((d) => d.id === viewingId);

  function renderGrid(items: DocumentSummary[]) {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setViewingId(d.id)}
            className="block h-16 w-16 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
          >
            {previews[d.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previews[d.id]} alt={d.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">…</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  const beforeDocs = docs?.filter((d) => d.category === "gallery_before") ?? [];
  const afterDocs = docs?.filter((d) => d.category === "gallery_after") ?? [];
  const otherDocs = docs?.filter((d) => d.category !== "gallery_before" && d.category !== "gallery_after") ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-700">{t("title")}</span>
        {beforeAfter ? (
          <>
            <button type="button" onClick={() => triggerUpload("gallery_before")} disabled={busy} className="btn-secondary px-2 py-0.5 text-xs">
              {busy ? t("uploading") : t("addBeforePhoto")}
            </button>
            <button type="button" onClick={() => triggerUpload("gallery_after")} disabled={busy} className="btn-secondary px-2 py-0.5 text-xs">
              {busy ? t("uploading") : t("addAfterPhoto")}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => triggerUpload("photo")} disabled={busy} className="btn-secondary px-2 py-0.5 text-xs">
            {busy ? t("uploading") : t("addPhoto")}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
      {docs === null ? null : docs.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noPhotos")}</p>
      ) : beforeAfter ? (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("before")}</span>
            {beforeDocs.length === 0 ? <p className="text-xs text-gray-400">{t("noPhotos")}</p> : renderGrid(beforeDocs)}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("after")}</span>
            {afterDocs.length === 0 ? <p className="text-xs text-gray-400">{t("noPhotos")}</p> : renderGrid(afterDocs)}
          </div>
          {otherDocs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{t("title")}</span>
              {renderGrid(otherDocs)}
            </div>
          )}
        </div>
      ) : (
        renderGrid(docs)
      )}

      {viewingDoc && previews[viewingDoc.id] && (
        <PhotoMarkupModal
          imageUrl={previews[viewingDoc.id]}
          busy={busy}
          onClose={() => setViewingId(null)}
          onSave={(blob) => saveMarkup(viewingDoc.id, blob)}
        />
      )}
    </div>
  );
}

function PhotoMarkupModal({
  imageUrl,
  busy,
  onClose,
  onSave,
}: {
  imageUrl: string;
  busy: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => void;
}) {
  const t = useTranslations("photos");
  const tc = useTranslations("common");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const [color, setColor] = useState(MARKUP_COLORS[0]);
  const [annotating, setAnnotating] = useState(false);
  const [hasMarks, setHasMarks] = useState(false);

  function setupCanvas() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(canvasRef.current!.width / 200, 2);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasMarks(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function clearMarkup() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMarks(false);
  }

  function save() {
    const img = imgRef.current;
    const markup = canvasRef.current;
    if (!img || !markup) return;
    const flattened = document.createElement("canvas");
    flattened.width = img.naturalWidth;
    flattened.height = img.naturalHeight;
    const ctx = flattened.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(markup, 0, 0);
    flattened.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-full max-w-3xl overflow-auto rounded-lg bg-white p-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={imageUrl} alt="" className="max-h-[70vh] max-w-full" onLoad={setupCanvas} />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full ${annotating ? "cursor-crosshair" : "pointer-events-none"}`}
            onPointerDown={annotating ? handlePointerDown : undefined}
            onPointerMove={annotating ? handlePointerMove : undefined}
            onPointerUp={annotating ? handlePointerUp : undefined}
            onPointerLeave={annotating ? handlePointerUp : undefined}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {annotating ? (
            <>
              {MARKUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-gray-900" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <button type="button" onClick={clearMarkup} className="btn-secondary px-2 py-1 text-xs">
                {t("clearMarkup")}
              </button>
              <button type="button" disabled={busy || !hasMarks} onClick={save} className="btn-primary px-3 py-1 text-xs">
                {t("saveMarkup")}
              </button>
              <button type="button" onClick={() => setAnnotating(false)} className="btn-secondary px-2 py-1 text-xs">
                {tc("cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setAnnotating(true)} className="btn-secondary px-2 py-1 text-xs">
                {t("annotate")}
              </button>
              <a href={imageUrl} target="_blank" rel="noreferrer" className="btn-secondary px-2 py-1 text-xs">
                {t("openFullSize")}
              </a>
              <button type="button" onClick={onClose} className="btn-secondary px-2 py-1 text-xs">
                {tc("close")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
