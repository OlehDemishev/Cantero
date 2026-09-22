"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PDFPageProxy } from "pdfjs-dist";
import { TAKEOFF_RATIO_UNITS, type TakeoffRatioUnit } from "@cantero/shared";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { loadPdf, pageVertices, renderPage, VertexIndex } from "@/lib/pdf";

interface TakeoffPoint {
  x: number;
  y: number;
}
type MeasurementType = "length" | "area" | "count";
type Mode = "idle" | "calibrate" | MeasurementType;

interface RateCatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}
interface TakeoffMeasurement {
  id: string;
  type: MeasurementType;
  label: string;
  points: TakeoffPoint[];
  value: string;
  unit: string;
  rateCatalogItemId: string | null;
}
interface TakeoffSummary {
  id: string;
  name: string;
  scaleUnit: string | null;
}
interface TakeoffDetail extends TakeoffSummary {
  scalePixelLength: string | null;
  scaleRealLength: string | null;
  imageMimeType: string;
  pageNumber: number;
  measurements: TakeoffMeasurement[];
}
interface Estimate {
  id: string;
  name: string;
  status: string;
  project: { id: string };
}

const MEASUREMENT_COLORS: Record<MeasurementType, string> = { length: "#465fff", area: "#12b76a", count: "#f79009" };
const CALIBRATE_COLOR = "#f04438";
/** How close (in screen pixels) a click has to be to a line end to snap to it. */
const SNAP_RADIUS_PX = 10;
const ZOOM_STEP = 1.25;

/** Digital takeoff on a plan photo, a scanned image, or a vector PDF (any page, or a Plan room
 * sheet). Lengths and areas need a scale — traced against a known length, or, on a PDF, the ratio
 * printed on the drawing; counts don't. */
export function TakeoffPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("takeoff");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();

  const [takeoffs, setTakeoffs] = useState<TakeoffSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TakeoffDetail | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [draftEstimates, setDraftEstimates] = useState<Estimate[]>([]);

  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPages, setUploadPages] = useState(0);
  const [uploadPage, setUploadPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [currentPoints, setCurrentPoints] = useState<TakeoffPoint[]>([]);
  const [calibrateForm, setCalibrateForm] = useState({ realLength: "", unit: "m" });
  const [ratioForm, setRatioForm] = useState<{ ratio: string; unit: TakeoffRatioUnit }>({ ratio: "100", unit: "m" });
  const [measurementForm, setMeasurementForm] = useState({ label: "", rateCatalogItemId: "" });
  const [addToEstimateFor, setAddToEstimateFor] = useState<string | null>(null);
  const [addToEstimateId, setAddToEstimateId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPdf = detail?.imageMimeType === "application/pdf";

  function loadTakeoffs() {
    apiFetch<TakeoffSummary[]>(`/takeoffs?projectId=${projectId}`).then(setTakeoffs);
  }

  const loadDetail = useCallback((id: string, keepMode = false) => {
    apiFetch<TakeoffDetail>(`/takeoffs/${id}`).then((d) => {
      setDetail(d);
      if (!keepMode) setMode("idle");
      setCurrentPoints([]);
    });
  }, []);

  useEffect(() => {
    loadTakeoffs();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then(setRateItems);
    apiFetch<Estimate[]>("/estimates").then((all) => setDraftEstimates(all.filter((e) => e.project.id === projectId && e.status === "draft")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // "Measure this sheet" in the Plan room links here with ?takeoff=<id>.
  const linked = searchParams.get("takeoff");
  useEffect(() => {
    if (linked && linked !== selectedId) selectTakeoff(linked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  function selectTakeoff(id: string) {
    setSelectedId(id);
    setError(null);
    loadDetail(id);
  }

  async function chooseFile(file: File | null) {
    setUploadFile(file);
    setUploadPages(0);
    setUploadPage(1);
    if (!file) return;
    if (!uploadName.trim()) setUploadName(file.name.replace(/\.[^.]+$/, ""));
    if (file.type === "application/pdf") {
      const pdf = await loadPdf(file).catch(() => null);
      setUploadPages(pdf?.doc.numPages ?? 0);
      await pdf?.destroy();
    }
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, name: uploadName.trim() });
      if (uploadPages > 1) params.set("page", String(uploadPage));
      const created = await apiUpload<{ id: string }>(`/takeoffs?${params.toString()}`, uploadFile);
      setUploadName("");
      setUploadFile(null);
      setUploadPages(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadTakeoffs();
      selectTakeoff(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function handlePoint(point: TakeoffPoint) {
    if (mode === "idle") return;
    if (mode === "calibrate") {
      setCurrentPoints((pts) => (pts.length >= 2 ? [point] : [...pts, point]));
      return;
    }
    setCurrentPoints((pts) => [...pts, point]);
  }

  async function setCalibration() {
    if (currentPoints.length !== 2 || !detail) return;
    const [a, b] = currentPoints;
    await apiFetch(`/takeoffs/${detail.id}/calibrate`, {
      method: "PATCH",
      body: JSON.stringify({ scalePixelLength: Math.hypot(b.x - a.x, b.y - a.y), scaleRealLength: Number(calibrateForm.realLength), scaleUnit: calibrateForm.unit }),
    });
    loadDetail(detail.id);
    loadTakeoffs();
  }

  async function setRatio() {
    if (!detail) return;
    await apiFetch(`/takeoffs/${detail.id}/calibrate-ratio`, {
      method: "PATCH",
      body: JSON.stringify({ ratio: Number(ratioForm.ratio), unit: ratioForm.unit }),
    });
    loadDetail(detail.id);
    loadTakeoffs();
  }

  function startMeasurement(type: MeasurementType) {
    setMode(type);
    setCurrentPoints([]);
    setMeasurementForm({ label: "", rateCatalogItemId: "" });
  }

  async function finishMeasurement() {
    if (!detail || (mode !== "length" && mode !== "area" && mode !== "count")) return;
    if (!measurementForm.label.trim()) return;
    await apiFetch(`/takeoffs/${detail.id}/measurements`, {
      method: "POST",
      body: JSON.stringify({ type: mode, label: measurementForm.label.trim(), points: currentPoints, rateCatalogItemId: measurementForm.rateCatalogItemId || undefined }),
    });
    loadDetail(detail.id);
  }

  async function deleteMeasurement(id: string) {
    if (!detail) return;
    await apiFetch(`/takeoffs/${detail.id}/measurements/${id}`, { method: "DELETE" });
    loadDetail(detail.id, true);
  }

  async function addMeasurementToEstimate(measurement: TakeoffMeasurement) {
    if (!addToEstimateId || !measurement.rateCatalogItemId) return;
    await apiFetch(`/estimates/${addToEstimateId}/lines`, {
      method: "POST",
      body: JSON.stringify({ rateCatalogItemId: measurement.rateCatalogItemId, quantity: Number(measurement.value) }),
    });
    setAddToEstimateFor(null);
  }

  const unitLabel = (unit: string) => (unit === "ea" ? t("pcs") : unit);
  const formatValue = (m: TakeoffMeasurement) => (m.type === "count" ? `${Number(m.value)} ${unitLabel(m.unit)}` : `${Number(m.value).toFixed(2)} ${m.unit}`);

  if (takeoffs === null) return null;

  const minPoints = mode === "area" ? 3 : mode === "count" ? 1 : 2;
  const measuring = mode === "length" || mode === "area" || mode === "count";

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {takeoffs.map((tk) => (
          <button
            key={tk.id}
            onClick={() => selectTakeoff(tk.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${selectedId === tk.id ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}
          >
            {tk.name}
          </button>
        ))}
        <form onSubmit={submitUpload} className="flex flex-wrap items-center gap-1">
          <input placeholder={t("newTakeoffName")} className="input w-40 py-1 text-xs" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary px-2 py-1 text-xs">
            {uploadFile ? uploadFile.name : tc("chooseFile")}
          </button>
          {uploadPages > 1 && (
            <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {t("page")}
              <select className="input w-auto py-1 text-xs" value={uploadPage} onChange={(e) => setUploadPage(Number(e.target.value))}>
                {Array.from({ length: uploadPages }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {t("pageOf", { n: i + 1, total: uploadPages })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={uploading || !uploadFile || !uploadName.trim()} className="btn-secondary px-2 py-1 text-xs">
            {t("upload")}
          </button>
        </form>
      </div>
      {error && <p className="mb-2 text-xs text-error-600">{error}</p>}

      {detail && (
        <div className="card">
          {mode === "calibrate" && (
            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-500">
              {isPdf && (
                <div className="flex flex-wrap items-end gap-2 border-b border-warning-200 pb-2 dark:border-warning-500/30">
                  <label className="flex flex-col gap-1">
                    {t("drawingScale")}
                    <span className="flex items-center gap-1">
                      1 :
                      <input type="number" min="1" step="any" className="input w-24" value={ratioForm.ratio} onChange={(e) => setRatioForm((f) => ({ ...f, ratio: e.target.value }))} />
                    </span>
                  </label>
                  <label className="flex flex-col gap-1">
                    {t("unit")}
                    <select className="input w-20" value={ratioForm.unit} onChange={(e) => setRatioForm((f) => ({ ...f, unit: e.target.value as TakeoffRatioUnit }))}>
                      {TAKEOFF_RATIO_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={!(Number(ratioForm.ratio) > 0)} onClick={setRatio} className="btn-primary px-3 py-1 text-xs">
                    {t("setScale")}
                  </button>
                  <span className="basis-full">{t("ratioHint")}</span>
                </div>
              )}
              {currentPoints.length < 2 ? (
                <span>{isPdf ? t("calibrateHintPdf") : t("calibrateHint")}</span>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    {t("realLength")}
                    <input type="number" step="any" className="input w-24" value={calibrateForm.realLength} onChange={(e) => setCalibrateForm((f) => ({ ...f, realLength: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t("unit")}
                    <input className="input w-16" value={calibrateForm.unit} onChange={(e) => setCalibrateForm((f) => ({ ...f, unit: e.target.value }))} />
                  </label>
                  <button type="button" disabled={!(Number(calibrateForm.realLength) > 0)} onClick={setCalibration} className="btn-primary px-3 py-1 text-xs">
                    {t("setScale")}
                  </button>
                </div>
              )}
              {detail.scaleUnit && (
                <button type="button" onClick={() => setMode("idle")} className="self-start underline">
                  {tc("cancel")}
                </button>
              )}
            </div>
          )}

          {mode === "idle" && (
            <div className="mb-3 flex flex-wrap gap-2">
              {detail.scaleUnit ? (
                <>
                  <button onClick={() => startMeasurement("length")} className="btn-secondary px-3 py-1 text-xs">
                    {t("drawLength")}
                  </button>
                  <button onClick={() => startMeasurement("area")} className="btn-secondary px-3 py-1 text-xs">
                    {t("drawArea")}
                  </button>
                </>
              ) : (
                <button onClick={() => setMode("calibrate")} className="btn-primary px-3 py-1 text-xs">
                  {t("setScaleFirst")}
                </button>
              )}
              <button onClick={() => startMeasurement("count")} className="btn-secondary px-3 py-1 text-xs">
                {t("drawCount")}
              </button>
              {detail.scaleUnit && (
                <button onClick={() => setMode("calibrate")} className="btn-secondary px-3 py-1 text-xs">
                  {t("recalibrate")}
                </button>
              )}
            </div>
          )}

          {measuring && (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t(mode === "length" ? "lengthHint" : mode === "area" ? "areaHint" : "countHint")}
                {mode === "count" && currentPoints.length > 0 && <strong className="ml-1 text-gray-700 dark:text-gray-200">{currentPoints.length}</strong>}
              </span>
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("label")}
                <input className="input w-40" value={measurementForm.label} onChange={(e) => setMeasurementForm((f) => ({ ...f, label: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("linkedRateItem")}
                <select className="input" value={measurementForm.rateCatalogItemId} onChange={(e) => setMeasurementForm((f) => ({ ...f, rateCatalogItemId: e.target.value }))}>
                  <option value="">—</option>
                  {rateItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {currentPoints.length > 0 && (
                <button type="button" onClick={() => setCurrentPoints((pts) => pts.slice(0, -1))} className="btn-secondary px-3 py-1 text-xs">
                  {t("undoPoint")}
                </button>
              )}
              <button type="button" disabled={currentPoints.length < minPoints || !measurementForm.label.trim()} onClick={finishMeasurement} className="btn-primary px-3 py-1 text-xs">
                {t("finishMeasurement")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("idle");
                  setCurrentPoints([]);
                }}
                className="btn-secondary px-3 py-1 text-xs"
              >
                {tc("cancel")}
              </button>
            </div>
          )}

          <TakeoffSurface key={detail.id} detail={detail} mode={mode} currentPoints={currentPoints} onPoint={handlePoint} />

          <ul className="mt-4 flex flex-col gap-2">
            {detail.measurements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEASUREMENT_COLORS[m.type] }} />
                  <span className="font-medium text-gray-800 dark:text-white/90">{m.label}</span>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatValue(m)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {m.rateCatalogItemId && draftEstimates.length > 0 && (
                    <>
                      {addToEstimateFor === m.id ? (
                        <>
                          <select className="input w-auto py-1 text-xs" value={addToEstimateId} onChange={(e) => setAddToEstimateId(e.target.value)}>
                            <option value="">—</option>
                            {draftEstimates.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => addMeasurementToEstimate(m)} className="btn-secondary px-2 py-1 text-xs">
                            {tc("save")}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setAddToEstimateFor(m.id)} className="text-xs text-brand-700 hover:underline dark:text-brand-400">
                          {t("addToEstimate")}
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => deleteMeasurement(m.id)} className="text-xs text-error-600 hover:underline">
                    {tc("delete")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The drawing with its measurements over it. Points are in drawing units — natural pixels for an
 * image, page units (1/72 in) for a PDF — so zooming only changes `zoom` (CSS px per unit), never
 * the stored geometry. A PDF re-renders from its vectors at every zoom.
 */
function TakeoffSurface({
  detail,
  mode,
  currentPoints,
  onPoint,
}: {
  detail: TakeoffDetail;
  mode: Mode;
  currentPoints: TakeoffPoint[];
  onPoint: (p: TakeoffPoint) => void;
}) {
  const t = useTranslations("takeoff");
  const isPdf = detail.imageMimeType === "application/pdf";
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [source, setSource] = useState<{ page?: PDFPageProxy; image?: HTMLImageElement; width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [snapIndex, setSnapIndex] = useState<VertexIndex | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [hover, setHover] = useState<{ point: TakeoffPoint; snapped: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  // Load the drawing once per takeoff.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    apiFetch<Blob>(`/takeoffs/${detail.id}/image`)
      .then(async (blob) => {
        if (isPdf) {
          const pdf = await loadPdf(blob);
          cleanup = () => void pdf.destroy();
          const page = await pdf.doc.getPage(detail.pageNumber);
          const vp = page.getViewport({ scale: 1 });
          if (cancelled) return;
          setSource({ page, width: vp.width, height: vp.height });
          // Geometry for snapping arrives after the first paint; a big sheet can take a moment.
          pageVertices(page)
            .then((v) => !cancelled && setSnapIndex(new VertexIndex(v)))
            .catch(() => undefined);
        } else {
          const url = URL.createObjectURL(blob);
          cleanup = () => URL.revokeObjectURL(url);
          const img = new Image();
          img.src = url;
          await img.decode();
          if (!cancelled) setSource({ image: img, width: img.naturalWidth, height: img.naturalHeight });
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [detail.id, detail.pageNumber, isPdf]);

  // Start fitted to the available width.
  useEffect(() => {
    if (!source || zoom !== null) return;
    const available = containerRef.current?.clientWidth ?? 800;
    setZoom(Math.min(available / source.width, 4));
  }, [source, zoom]);

  // Paint the drawing at the current zoom.
  useEffect(() => {
    const canvas = baseRef.current;
    if (!source || !canvas || zoom === null) return;
    if (source.page) {
      const job = renderPage(source.page, canvas, zoom);
      return job.cancel;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.floor(source.width * zoom * dpr);
    canvas.height = Math.floor(source.height * zoom * dpr);
    canvas.style.width = `${Math.floor(source.width * zoom)}px`;
    canvas.style.height = `${Math.floor(source.height * zoom)}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image!, 0, 0, canvas.width, canvas.height);
  }, [source, zoom]);

  // Paint measurements, the one in progress, and the snap cursor.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!source || !canvas || zoom === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.floor(source.width * zoom * dpr);
    canvas.height = Math.floor(source.height * zoom * dpr);
    canvas.style.width = `${Math.floor(source.width * zoom)}px`;
    canvas.style.height = `${Math.floor(source.height * zoom)}px`;
    drawOverlay(canvas.getContext("2d")!, zoom * dpr, dpr, detail.measurements, currentPoints, mode, hover);
  }, [source, zoom, detail.measurements, currentPoints, mode, hover]);

  const toDrawing = (e: React.MouseEvent<HTMLCanvasElement>): { point: TakeoffPoint; snapped: boolean } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: (e.clientX - rect.left) / zoom!, y: (e.clientY - rect.top) / zoom! };
    if (snapOn && snapIndex && mode !== "idle" && mode !== "count") {
      const hit = snapIndex.nearest(point.x, point.y, SNAP_RADIUS_PX / zoom!);
      if (hit) return { point: hit, snapped: true };
    }
    return { point, snapped: false };
  };

  const zoomBy = (factor: number) => setZoom((z) => (z === null ? z : Math.min(Math.max(z * factor, 0.05), 20)));

  if (failed) return <p className="text-xs text-error-600">{t("loadFailed")}</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} className="btn-secondary px-2 py-1 text-xs" aria-label={t("zoomOut")}>
          −
        </button>
        <span className="w-12 text-center tabular-nums">{zoom === null ? "…" : `${Math.round((zoom * 100) / (isPdf ? 96 / 72 : 1))}%`}</span>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} className="btn-secondary px-2 py-1 text-xs" aria-label={t("zoomIn")}>
          +
        </button>
        <button type="button" onClick={() => setZoom(source ? Math.min((containerRef.current?.clientWidth ?? 800) / source.width, 4) : null)} className="btn-secondary px-2 py-1 text-xs">
          {t("zoomFit")}
        </button>
        {isPdf && (
          <label className="ml-2 flex items-center gap-1">
            <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
            {t("snap")}
            {snapIndex && <span className="text-gray-400">({t("snapPoints", { n: snapIndex.size })})</span>}
          </label>
        )}
        {isPdf && <span className="ml-auto">{t("pageN", { n: detail.pageNumber })}</span>}
      </div>
      <div ref={containerRef} className="max-h-[70vh] overflow-auto rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {!source && <p className="p-4 text-xs text-gray-500 dark:text-gray-400">{t("loadingDrawing")}</p>}
        <div className="relative inline-block">
          <canvas ref={baseRef} className="block bg-white" />
          <canvas
            ref={overlayRef}
            className={`absolute left-0 top-0 ${mode === "idle" ? "" : "cursor-crosshair"}`}
            onClick={(e) => mode !== "idle" && onPoint(toDrawing(e).point)}
            onMouseMove={(e) => mode !== "idle" && setHover(toDrawing(e))}
            onMouseLeave={() => setHover(null)}
          />
        </div>
      </div>
    </div>
  );
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  k: number,
  dpr: number,
  measurements: TakeoffMeasurement[],
  currentPoints: TakeoffPoint[],
  mode: Mode,
  hover: { point: TakeoffPoint; snapped: boolean } | null,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const line = 2 * dpr;
  const px = (p: TakeoffPoint) => [p.x * k, p.y * k] as const;

  const countMarker = (p: TakeoffPoint, n: number, color: string) => {
    const [x, y] = px(p);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${9 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), x, y + 0.5 * dpr);
  };

  const path = (points: TakeoffPoint[], color: string, closed: boolean, dashed: boolean) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}33`;
    ctx.lineWidth = line;
    ctx.setLineDash(dashed ? [line * 2, line] : []);
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
    if (closed) ctx.closePath();
    ctx.stroke();
    if (closed && !dashed) ctx.fill();
    ctx.setLineDash([]);
  };

  for (const m of measurements) {
    if (m.type === "count") m.points.forEach((p, i) => countMarker(p, i + 1, MEASUREMENT_COLORS.count));
    else path(m.points, MEASUREMENT_COLORS[m.type], m.type === "area", false);
  }

  if (mode !== "idle" && currentPoints.length > 0) {
    const color = mode === "calibrate" ? CALIBRATE_COLOR : MEASUREMENT_COLORS[mode];
    if (mode === "count") currentPoints.forEach((p, i) => countMarker(p, i + 1, color));
    else {
      const trail = hover ? [...currentPoints, hover.point] : currentPoints;
      path(trail, color, false, true);
      for (const p of currentPoints) {
        const [x, y] = px(p);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Snap cursor: a square on the line end the next click will land on.
  if (mode !== "idle" && hover?.snapped) {
    const [x, y] = px(hover.point);
    const s = 6 * dpr;
    ctx.strokeStyle = CALIBRATE_COLOR;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(x - s, y - s, s * 2, s * 2);
  }
}
