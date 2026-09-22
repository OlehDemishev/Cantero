"use dom";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DOMProps } from "expo/dom";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// Registers pdf.js's worker code on globalThis, so documents are parsed on this thread: an app
// bundle has no URL to load a separate worker script from, and a sheet is one page.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

/**
 * One drawing sheet, rendered by pdf.js inside a web view (an Expo DOM component, bundled into the
 * app, so it works offline) — the same renderer as the web Plan room. Pinch to zoom, drag to pan.
 * Everything positioned on the sheet (pins, link boxes, taps) is in fractions of the page, top-left
 * origin — the coordinates the API stores for RFI/punch pins and sheet links.
 */

export interface SheetPin {
  id: string;
  kind: "rfi" | "punch";
  x: number;
  y: number;
  label: string;
  done: boolean;
}

export interface SheetLinkBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetSheetId: string;
  label: string;
}

/** Long edge of the rendered page. iOS caps a canvas near 16.7 MP; 4800 px keeps an A0/A1 sheet under that
 * and lets a person zoom several times past fit before lines soften. */
const RENDER_LONG_EDGE = 4800;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const TAP_SLOP = 8;

export default function SheetCanvas({
  data,
  mimeType,
  pins,
  links,
  placing,
  dark,
  labels,
  onTap,
  onOpenSheet,
  onPinPress,
  onError,
}: {
  /** The sheet file, base64. */
  data: string;
  mimeType: string;
  pins: SheetPin[];
  links: SheetLinkBox[];
  /** When true, a tap on the sheet is reported through onTap (placing a new pin). */
  placing: boolean;
  dark: boolean;
  labels: { zoomIn: string; zoomOut: string; fit: string };
  onTap: (x: number, y: number) => Promise<void>;
  onOpenSheet: (sheetId: string) => Promise<void>;
  onPinPress: (id: string, kind: "rfi" | "punch") => Promise<void>;
  onError: (message: string) => Promise<void>;
  dom?: DOMProps;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Render the sheet once, at a fixed high resolution; zoom scales it with CSS.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current!;
    (async () => {
      if (mimeType === "application/pdf") {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const task = pdfjs.getDocument({ data: bytes });
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = RENDER_LONG_EDGE / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (!cancelled) setSize({ width: base.width, height: base.height });
        void task.destroy();
      } else {
        const img = new Image();
        img.src = `data:${mimeType};base64,${data}`;
        await img.decode();
        const scale = Math.min(1, RENDER_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.floor(img.naturalWidth * scale);
        canvas.height = Math.floor(img.naturalHeight * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (!cancelled) setSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    })().catch((err: unknown) => void onError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mimeType]);

  const fit = () => {
    const box = viewportRef.current;
    if (!box || !size) return;
    const scale = Math.min(box.clientWidth / size.width, box.clientHeight / size.height);
    setView({ scale, x: (box.clientWidth - size.width * scale) / 2, y: (box.clientHeight - size.height * scale) / 2 });
  };
  useEffect(fit, [size]);

  /** Zoom by `factor` keeping the page point under (cx, cy) where it is. */
  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const scale = Math.min(Math.max(v.scale * factor, fitScale() * MIN_ZOOM), fitScale() * MAX_ZOOM);
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };
  const fitScale = () => {
    const box = viewportRef.current;
    return box && size ? Math.min(box.clientWidth / size.width, box.clientHeight / size.height) : 1;
  };

  // Pointer gestures: one finger pans (or taps), two fingers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; startTime: number; pinchDist?: number } | null>(null);

  // No pointer capture: the viewport already fills the screen, and capturing would retarget the
  // click on a pin or link button to the viewport itself.
  const onPointerDown = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { startX: e.clientX, startY: e.clientY, moved: false, startTime: Date.now() };
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current!.getBoundingClientRect();
      if (gesture.current.pinchDist) zoomAt(dist / gesture.current.pinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      gesture.current.pinchDist = dist;
      return;
    }
    if (Math.hypot(next.x - gesture.current.startX, next.y - gesture.current.startY) > TAP_SLOP) gesture.current.moved = true;
    if (gesture.current.moved) setView((v) => ({ ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y }));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved || Date.now() - g.startTime > 500 || !placing || !size) return;
    // A tap while placing a pin: report where on the page it landed.
    const rect = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const x = (e.clientX - rect.left - v.x) / (size.width * v.scale);
    const y = (e.clientY - rect.top - v.y) / (size.height * v.scale);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) void onTap(x, y);
  };

  const colors = dark
    ? { ground: "#0f1420", button: "#1f2937", buttonText: "#f9fafb", border: "#374151" }
    : { ground: "#e5e7eb", button: "#ffffff", buttonText: "#111827", border: "#d1d5db" };

  const page: CSSProperties = size
    ? {
        position: "absolute",
        left: 0,
        top: 0,
        width: size.width,
        height: size.height,
        transformOrigin: "0 0",
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
      }
    : { display: "none" };

  const zoomButton: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.button,
    color: colors.buttonText,
    fontSize: 20,
    fontFamily: "system-ui, sans-serif",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: colors.ground, overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
      <div
        ref={viewportRef}
        style={{ position: "absolute", inset: 0, cursor: placing ? "crosshair" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={page}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,.25)" }} />
          {!placing &&
            links.map((l) => (
              <button
                key={l.id}
                aria-label={l.label}
                onClick={() => void onOpenSheet(l.targetSheetId)}
                style={{
                  position: "absolute",
                  left: `${(l.x - 0.003) * 100}%`,
                  top: `${(l.y - 0.003) * 100}%`,
                  width: `${(l.width + 0.006) * 100}%`,
                  height: `${(l.height + 0.006) * 100}%`,
                  background: "rgba(70,95,255,.18)",
                  border: "1px solid rgba(70,95,255,.7)",
                  borderRadius: 2,
                  padding: 0,
                }}
              />
            ))}
          {pins.map((p) => (
            <button
              key={`${p.kind}-${p.id}`}
              aria-label={p.label}
              onClick={() => void onPinPress(p.id, p.kind)}
              style={{
                position: "absolute",
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                // Counter-scaled so a pin stays finger-sized at any zoom.
                transform: `translate(-50%, -50%) scale(${1 / view.scale})`,
                width: 28,
                height: 28,
                borderRadius: 14,
                border: "3px solid #fff",
                background: p.done ? "#9ca3af" : p.kind === "rfi" ? "#2563eb" : "#f97316",
                boxShadow: "0 1px 4px rgba(0,0,0,.4)",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <button aria-label={labels.zoomIn} style={zoomButton} onClick={() => zoomAt(1.6, (viewportRef.current?.clientWidth ?? 0) / 2, (viewportRef.current?.clientHeight ?? 0) / 2)}>
          +
        </button>
        <button aria-label={labels.zoomOut} style={zoomButton} onClick={() => zoomAt(1 / 1.6, (viewportRef.current?.clientWidth ?? 0) / 2, (viewportRef.current?.clientHeight ?? 0) / 2)}>
          −
        </button>
        <button aria-label={labels.fit} style={{ ...zoomButton, fontSize: 13 }} onClick={fit}>
          ⤢
        </button>
      </div>
    </div>
  );
}
