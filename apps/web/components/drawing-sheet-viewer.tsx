"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AnnotationType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface Point {
  x: number;
  y: number;
}
interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point[];
  color: string;
  text: string | null;
  authorName: string;
}
interface DrawingSheet {
  id: string;
  projectId: string;
  sheetNumber: string;
  discipline: string | null;
  title: string | null;
  revision: string | null;
  mimeType: string;
}
interface PinnedItem {
  id: string;
  label: string;
  pinX: number;
  pinY: number;
}
interface RfiRow {
  id: string;
  number: string;
  subject: string;
  drawingSheetId: string | null;
  pinX: number | null;
  pinY: number | null;
}
interface PunchRow {
  id: string;
  title: string;
  drawingSheetId: string | null;
  pinX: number | null;
  pinY: number | null;
}

const TOOL_COLORS: Record<AnnotationType, string> = {
  freehand: "#e11d48",
  rectangle: "#2563eb",
  cloud: "#d97706",
  arrow: "#16a34a",
  text: "#7c3aed",
};

/** Renders a normalized-[0,1] point onto the canvas's current pixel size. */
function toPixels(p: Point, canvas: HTMLCanvasElement): Point {
  return { x: p.x * canvas.width, y: p.y * canvas.height };
}

function drawAnnotation(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, points: Point[], type: AnnotationType, color: string, text?: string | null) {
  const px = points.map((p) => toPixels(p, canvas));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  if (type === "freehand") {
    ctx.beginPath();
    px.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else if (type === "rectangle" || type === "cloud") {
    if (px.length < 2) return;
    const [a, b] = px;
    if (type === "cloud") ctx.setLineDash([8, 4]);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.setLineDash([]);
  } else if (type === "arrow") {
    if (px.length < 2) return;
    const [a, b] = px;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 6), b.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 6), b.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else if (type === "text") {
    if (px.length < 1 || !text) return;
    ctx.font = "16px sans-serif";
    ctx.fillText(text, px[0].x, px[0].y);
  }
}

export function DrawingSheetViewer({ sheetId }: { sheetId: string }) {
  const t = useTranslations("drawings");
  const tc = useTranslations("common");

  const [sheet, setSheet] = useState<DrawingSheet | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[] | null>(null);
  const [tool, setTool] = useState<AnnotationType | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);

  const [allRfis, setAllRfis] = useState<RfiRow[]>([]);
  const [allPunchItems, setAllPunchItems] = useState<PunchRow[]>([]);
  const [pinTool, setPinTool] = useState(false);
  const [pinDraft, setPinDraft] = useState<{ point: Point; kind: "rfi" | "punch"; targetId: string } | null>(null);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  function loadMeta() {
    apiFetch<DrawingSheet>(`/drawing-sheets/${sheetId}`).then(setSheet);
  }
  function loadAnnotations() {
    apiFetch<Annotation[]>(`/drawing-sheets/${sheetId}/annotations`).then(setAnnotations);
  }

  useEffect(() => {
    loadMeta();
    loadAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  function loadPins() {
    if (!sheet) return;
    apiFetch<RfiRow[]>(`/rfis?projectId=${sheet.projectId}`).then(setAllRfis);
    apiFetch<PunchRow[]>(`/punch-list?projectId=${sheet.projectId}`).then(setAllPunchItems);
  }

  useEffect(loadPins, [sheet, sheetId]);

  const rfis = allRfis.filter((r) => r.drawingSheetId === sheetId);
  const punchItems = allPunchItems.filter((p) => p.drawingSheetId === sheetId);
  const pins: PinnedItem[] = [
    ...rfis.filter((r) => r.pinX !== null && r.pinY !== null).map((r) => ({ id: r.id, label: `${r.number}: ${r.subject}`, pinX: r.pinX!, pinY: r.pinY! })),
    ...punchItems.filter((p) => p.pinX !== null && p.pinY !== null).map((p) => ({ id: p.id, label: p.title, pinX: p.pinX!, pinY: p.pinY! })),
  ];

  // Load and render the base content (image or first PDF page) once we know the mimeType.
  useEffect(() => {
    if (!sheet) return;
    let cancelled = false;

    apiFetch<Blob>(`/drawing-sheets/${sheetId}/file`).then(async (blob) => {
      if (cancelled) return;
      const base = baseCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!base || !overlay) return;

      if (sheet.mimeType === "application/pdf") {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        base.width = viewport.width;
        base.height = viewport.height;
        overlay.width = viewport.width;
        overlay.height = viewport.height;
        const ctx = base.getContext("2d")!;
        await page.render({ canvas: base, canvasContext: ctx, viewport }).promise;
      } else {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise((resolve) => (img.onload = resolve));
        base.width = img.naturalWidth;
        base.height = img.naturalHeight;
        overlay.width = img.naturalWidth;
        overlay.height = img.naturalHeight;
        base.getContext("2d")!.drawImage(img, 0, 0);
      }
      redrawOverlay();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sheetId]);

  function redrawOverlay() {
    const overlay = overlayCanvasRef.current;
    if (!overlay || overlay.width === 0) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const ann of annotations ?? []) {
      drawAnnotation(ctx, overlay, ann.points, ann.type, ann.color, ann.text);
    }
    if (tool && draftPoints.length > 0) {
      drawAnnotation(ctx, overlay, draftPoints, tool, TOOL_COLORS[tool]);
    }
    for (const pin of pins) {
      const p = toPixels({ x: pin.pinX, y: pin.pinY }, overlay);
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  useEffect(redrawOverlay, [annotations, draftPoints, tool, pins]);

  function normalizedPoint(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  async function saveDraft(points: Point[]) {
    if (!tool) return;
    let text: string | undefined;
    if (tool === "text") {
      text = window.prompt(t("enterCalloutText")) ?? undefined;
      if (!text) {
        setDraftPoints([]);
        return;
      }
    }
    setBusy(true);
    try {
      await apiFetch(`/drawing-sheets/${sheetId}/annotations`, {
        method: "POST",
        body: JSON.stringify({ type: tool, points, color: TOOL_COLORS[tool], text }),
      });
      setDraftPoints([]);
      setTool(null);
      loadAnnotations();
    } finally {
      setBusy(false);
    }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (pinTool) {
      setPinDraft({ point: normalizedPoint(e), kind: "rfi", targetId: "" });
      setPinTool(false);
      return;
    }
    if (!tool) return;
    const point = normalizedPoint(e);
    if (tool === "freehand") return; // handled via drag
    if (tool === "text") {
      saveDraft([point]);
      return;
    }
    // rectangle / cloud / arrow: two clicks (start, end). saveDraft has a side effect (an API
    // call), so it must run outside the setState updater — React 18 Strict Mode double-invokes
    // updater functions to catch exactly this, which previously created duplicate annotations.
    if (draftPoints.length === 0) {
      setDraftPoints([point]);
    } else {
      const start = draftPoints[0];
      setDraftPoints([]);
      saveDraft([start, point]);
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "freehand") return;
    drawingRef.current = true;
    setDraftPoints([normalizedPoint(e)]);
  }
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "freehand" || !drawingRef.current) return;
    setDraftPoints((pts) => [...pts, normalizedPoint(e)]);
  }
  function handleMouseUp() {
    if (tool !== "freehand" || !drawingRef.current) return;
    drawingRef.current = false;
    const points = draftPoints;
    setDraftPoints([]);
    if (points.length >= 2) saveDraft(points);
  }

  async function deleteAnnotation(id: string) {
    await apiFetch(`/drawing-sheets/${sheetId}/annotations/${id}`, { method: "DELETE" });
    loadAnnotations();
  }

  async function confirmPin() {
    if (!pinDraft || !pinDraft.targetId) return;
    const route = pinDraft.kind === "rfi" ? `/rfis/${pinDraft.targetId}/pin` : `/punch-list/${pinDraft.targetId}/pin`;
    await apiFetch(route, {
      method: "PATCH",
      body: JSON.stringify({ drawingSheetId: sheetId, pinX: pinDraft.point.x, pinY: pinDraft.point.y }),
    });
    setPinDraft(null);
    loadPins();
  }

  if (!sheet) return <p className="text-gray-500 dark:text-gray-400">{tc("loading")}</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {sheet.sheetNumber} {sheet.title && `— ${sheet.title}`}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sheet.discipline ?? t("noDiscipline")} {sheet.revision && `· ${t("revision")} ${sheet.revision}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["freehand", "rectangle", "cloud", "arrow", "text"] as AnnotationType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setDraftPoints([]);
                setTool(tool === type ? null : type);
              }}
              className={`rounded-md px-2 py-1 text-xs font-medium ${tool === type ? "bg-brand-600 text-white" : "btn-secondary"}`}
            >
              {t(`tool_${type}`)}
            </button>
          ))}
          <button
            onClick={() => {
              setTool(null);
              setPinTool(!pinTool);
            }}
            className={`rounded-md px-2 py-1 text-xs font-medium ${pinTool ? "bg-brand-600 text-white" : "btn-secondary"}`}
          >
            {t("tool_pin")}
          </button>
        </div>
      </div>

      <div className="relative inline-block max-w-full overflow-auto border border-gray-200 dark:border-gray-800">
        <canvas ref={baseCanvasRef} className="max-h-[75vh] max-w-full" />
        <canvas
          ref={overlayCanvasRef}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={`absolute inset-0 h-full w-full ${tool || pinTool ? "cursor-crosshair" : ""}`}
        />
      </div>

      {busy && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>}

      {pinDraft && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-2 text-xs dark:border-gray-800">
          <label className="flex flex-col gap-1">
            {t("pinLinkType")}
            <select
              className="input py-1"
              value={pinDraft.kind}
              onChange={(e) => setPinDraft((d) => (d ? { ...d, kind: e.target.value as "rfi" | "punch", targetId: "" } : d))}
            >
              <option value="rfi">{t("pinLinkRfi")}</option>
              <option value="punch">{t("pinLinkPunch")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {t("pinLinkItem")}
            <select
              className="input py-1"
              value={pinDraft.targetId}
              onChange={(e) => setPinDraft((d) => (d ? { ...d, targetId: e.target.value } : d))}
            >
              <option value="">—</option>
              {(pinDraft.kind === "rfi" ? allRfis : allPunchItems).map((item) => (
                <option key={item.id} value={item.id}>
                  {"number" in item ? `${item.number}: ${item.subject}` : item.title}
                </option>
              ))}
            </select>
          </label>
          <button onClick={confirmPin} disabled={!pinDraft.targetId} className="btn-primary px-2 py-1">
            {tc("save")}
          </button>
          <button onClick={() => setPinDraft(null)} className="btn-secondary px-2 py-1">
            {tc("cancel")}
          </button>
        </div>
      )}

      {annotations && annotations.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {annotations.map((a) => (
            <li key={a.id} className="flex items-center justify-between">
              <span>
                {t(`tool_${a.type}`)} — {a.authorName}
                {a.text && `: "${a.text}"`}
              </span>
              <button onClick={() => deleteAnnotation(a.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {pins.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {pins.map((p) => (
            <li key={p.id}>📍 {p.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
