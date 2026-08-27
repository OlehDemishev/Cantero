"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUpload } from "@/lib/api-client";

interface TakeoffPoint {
  x: number;
  y: number;
}
type MeasurementType = "length" | "area";

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
  measurements: TakeoffMeasurement[];
}
interface Estimate {
  id: string;
  name: string;
  status: string;
  project: { id: string };
}

const MEASUREMENT_COLORS: Record<MeasurementType, string> = { length: "#465fff", area: "#12b76a" };

export function TakeoffPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("takeoff");
  const tc = useTranslations("common");

  const [takeoffs, setTakeoffs] = useState<TakeoffSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TakeoffDetail | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rateItems, setRateItems] = useState<RateCatalogItem[]>([]);
  const [draftEstimates, setDraftEstimates] = useState<Estimate[]>([]);

  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);

  const [mode, setMode] = useState<"idle" | "calibrate" | "length" | "area">("idle");
  const [currentPoints, setCurrentPoints] = useState<TakeoffPoint[]>([]);
  const [calibrateForm, setCalibrateForm] = useState({ realLength: "", unit: "m" });
  const [measurementForm, setMeasurementForm] = useState({ label: "", rateCatalogItemId: "" });
  const [addToEstimateFor, setAddToEstimateFor] = useState<string | null>(null);
  const [addToEstimateId, setAddToEstimateId] = useState("");

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    drawOverlay(canvas, detail?.measurements ?? [], currentPoints, mode);
  }, [detail, currentPoints, mode]);

  function loadTakeoffs() {
    apiFetch<TakeoffSummary[]>(`/takeoffs?projectId=${projectId}`).then(setTakeoffs);
  }

  useEffect(() => {
    loadTakeoffs();
    apiFetch<RateCatalogItem[]>("/estimates/rate-catalog").then(setRateItems);
    apiFetch<Estimate[]>("/estimates").then((all) =>
      setDraftEstimates(all.filter((e) => e.project.id === projectId && e.status === "draft")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function loadDetail(id: string) {
    apiFetch<TakeoffDetail>(`/takeoffs/${id}`).then((d) => {
      setDetail(d);
      setMode(d.scaleUnit ? "idle" : "calibrate");
      setCurrentPoints([]);
    });
    apiFetch<Blob>(`/takeoffs/${id}/image`).then((blob) => setImageUrl(URL.createObjectURL(blob)));
  }

  function selectTakeoff(id: string) {
    setSelectedId(id);
    loadDetail(id);
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    const input = document.getElementById("takeoff-file-input") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !uploadName.trim()) return;
    setUploading(true);
    try {
      const created = await apiUpload<{ id: string }>(
        `/takeoffs?projectId=${projectId}&name=${encodeURIComponent(uploadName.trim())}`,
        file,
      );
      setUploadName("");
      if (input) input.value = "";
      loadTakeoffs();
      selectTakeoff(created.id);
    } finally {
      setUploading(false);
    }
  }

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>): TakeoffPoint {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (mode === "idle") return;
    const point = canvasPoint(e);
    if (mode === "calibrate") {
      setCurrentPoints((pts) => (pts.length >= 2 ? [point] : [...pts, point]));
      return;
    }
    setCurrentPoints((pts) => [...pts, point]);
  }

  async function setCalibration() {
    if (currentPoints.length !== 2 || !detail) return;
    const [a, b] = currentPoints;
    const scalePixelLength = Math.hypot(b.x - a.x, b.y - a.y);
    await apiFetch(`/takeoffs/${detail.id}/calibrate`, {
      method: "PATCH",
      body: JSON.stringify({ scalePixelLength, scaleRealLength: Number(calibrateForm.realLength), scaleUnit: calibrateForm.unit }),
    });
    setCurrentPoints([]);
    setMode("idle");
    loadDetail(detail.id);
    loadTakeoffs();
  }

  function startMeasurement(type: MeasurementType) {
    setMode(type);
    setCurrentPoints([]);
    setMeasurementForm({ label: "", rateCatalogItemId: "" });
  }

  async function finishMeasurement() {
    if (!detail || (mode !== "length" && mode !== "area")) return;
    if (!measurementForm.label.trim()) return;
    await apiFetch(`/takeoffs/${detail.id}/measurements`, {
      method: "POST",
      body: JSON.stringify({
        type: mode,
        label: measurementForm.label.trim(),
        points: currentPoints,
        rateCatalogItemId: measurementForm.rateCatalogItemId || undefined,
      }),
    });
    setCurrentPoints([]);
    setMode("idle");
    loadDetail(detail.id);
  }

  async function deleteMeasurement(id: string) {
    if (!detail) return;
    await apiFetch(`/takeoffs/${detail.id}/measurements/${id}`, { method: "DELETE" });
    loadDetail(detail.id);
  }

  async function addMeasurementToEstimate(measurement: TakeoffMeasurement) {
    if (!addToEstimateId || !measurement.rateCatalogItemId) return;
    await apiFetch(`/estimates/${addToEstimateId}/lines`, {
      method: "POST",
      body: JSON.stringify({ rateCatalogItemId: measurement.rateCatalogItemId, quantity: Number(measurement.value) }),
    });
    setAddToEstimateFor(null);
  }

  if (takeoffs === null) return null;

  const minPointsToFinish = mode === "area" ? 3 : 2;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("title")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("hint")}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {takeoffs.map((tk) => (
          <button
            key={tk.id}
            onClick={() => selectTakeoff(tk.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${selectedId === tk.id ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {tk.name}
          </button>
        ))}
        <form onSubmit={submitUpload} className="flex items-center gap-1">
          <input
            placeholder={t("newTakeoffName")}
            className="input w-40 py-1 text-xs"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />
          <input id="takeoff-file-input" type="file" accept="image/*" className="text-xs" />
          <button type="submit" disabled={uploading} className="btn-secondary px-2 py-1 text-xs">
            {t("upload")}
          </button>
        </form>
      </div>

      {detail && imageUrl && (
        <div className="card">
          {mode === "calibrate" && (
            <div className="mb-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-700">
              {currentPoints.length < 2 ? (
                t("calibrateHint")
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    {t("realLength")}
                    <input
                      type="number"
                      step="any"
                      className="input w-24"
                      value={calibrateForm.realLength}
                      onChange={(e) => setCalibrateForm((f) => ({ ...f, realLength: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t("unit")}
                    <input
                      className="input w-16"
                      value={calibrateForm.unit}
                      onChange={(e) => setCalibrateForm((f) => ({ ...f, unit: e.target.value }))}
                    />
                  </label>
                  <button type="button" onClick={setCalibration} className="btn-primary px-3 py-1 text-xs">
                    {t("setScale")}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "idle" && detail.scaleUnit && (
            <div className="mb-3 flex gap-2">
              <button onClick={() => startMeasurement("length")} className="btn-secondary px-3 py-1 text-xs">
                {t("drawLength")}
              </button>
              <button onClick={() => startMeasurement("area")} className="btn-secondary px-3 py-1 text-xs">
                {t("drawArea")}
              </button>
              <button onClick={() => setMode("calibrate")} className="btn-secondary px-3 py-1 text-xs">
                {t("recalibrate")}
              </button>
            </div>
          )}

          {(mode === "length" || mode === "area") && (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 p-3">
              <span className="text-xs text-gray-500">{t(mode === "length" ? "lengthHint" : "areaHint")}</span>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                {t("label")}
                <input
                  className="input w-40"
                  value={measurementForm.label}
                  onChange={(e) => setMeasurementForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                {t("linkedRateItem")}
                <select
                  className="input"
                  value={measurementForm.rateCatalogItemId}
                  onChange={(e) => setMeasurementForm((f) => ({ ...f, rateCatalogItemId: e.target.value }))}
                >
                  <option value="">—</option>
                  {rateItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={currentPoints.length < minPointsToFinish || !measurementForm.label.trim()}
                onClick={finishMeasurement}
                className="btn-primary px-3 py-1 text-xs"
              >
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

          <div className="relative inline-block max-w-full overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              className="max-h-[70vh] max-w-full"
              onLoad={() => {
                const img = imgRef.current;
                const canvas = canvasRef.current;
                if (!img || !canvas) return;
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                drawOverlay(canvas, detail.measurements, currentPoints, mode);
              }}
            />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`absolute inset-0 h-full w-full ${mode === "idle" ? "" : "cursor-crosshair"}`}
            />
          </div>

          <ul className="mt-4 flex flex-col gap-2">
            {detail.measurements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEASUREMENT_COLORS[m.type] }} />
                  <span className="font-medium text-gray-800 dark:text-white/90">{m.label}</span>
                  <span className="text-xs text-gray-500">
                    {Number(m.value).toFixed(2)} {m.unit}
                  </span>
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
                        <button onClick={() => setAddToEstimateFor(m.id)} className="text-xs text-brand-700 hover:underline">
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

function drawOverlay(
  canvas: HTMLCanvasElement,
  measurements: TakeoffMeasurement[],
  currentPoints: TakeoffPoint[],
  mode: "idle" | "calibrate" | "length" | "area",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lineWidth = Math.max(canvas.width / 400, 2);

  for (const m of measurements) {
    ctx.strokeStyle = MEASUREMENT_COLORS[m.type];
    ctx.fillStyle = `${MEASUREMENT_COLORS[m.type]}33`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    m.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (m.type === "area") ctx.closePath();
    ctx.stroke();
    if (m.type === "area") ctx.fill();
  }

  if (currentPoints.length > 0) {
    ctx.strokeStyle = mode === "calibrate" ? "#f79009" : mode === "area" ? MEASUREMENT_COLORS.area : MEASUREMENT_COLORS.length;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([lineWidth * 2, lineWidth]);
    ctx.beginPath();
    currentPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of currentPoints) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lineWidth * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
