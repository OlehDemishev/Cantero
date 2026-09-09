"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface GpsPing {
  id: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

const PING_INTERVAL_MS = 30_000;
const VIEWBOX_SIZE = 300;
const PADDING = 20;

/** Plots today's route from self-reported browser/device GPS pings — no telematics hardware or
 * external map/tiles provider behind it, just a normalized polyline over the day's points. */
export function EquipmentGpsPanel({ equipmentId }: { equipmentId: string }) {
  const t = useTranslations("equipment");
  const [pings, setPings] = useState<GpsPing[] | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  function load() {
    apiFetch<GpsPing[]>(`/equipment/${equipmentId}/gps-pings`).then(setPings);
  }

  useEffect(load, [equipmentId]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function startTracking() {
    if (!("geolocation" in navigator)) {
      setError(t("gpsUnsupported"));
      return;
    }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < PING_INTERVAL_MS) return;
        lastSentAtRef.current = now;
        apiFetch(`/equipment/${equipmentId}/gps-pings`, {
          method: "POST",
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).then(load);
      },
      () => setError(t("gpsDenied")),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    watchIdRef.current = id;
    setTracking(true);
  }

  function stopTracking() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
  }

  const points =
    pings && pings.length > 1
      ? (() => {
          const lats = pings.map((p) => p.lat);
          const lngs = pings.map((p) => p.lng);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const latSpan = maxLat - minLat || 1;
          const lngSpan = maxLng - minLng || 1;
          return pings.map((p) => {
            const x = PADDING + ((p.lng - minLng) / lngSpan) * (VIEWBOX_SIZE - 2 * PADDING);
            // Latitude increases northward but SVG y increases downward — flip so north is up.
            const y = PADDING + (1 - (p.lat - minLat) / latSpan) * (VIEWBOX_SIZE - 2 * PADDING);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });
        })()
      : null;

  return (
    <section className="card lg:col-span-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("gpsTracking")}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("gpsTrackingHint")}</p>
        </div>
        <button onClick={tracking ? stopTracking : startTracking} className={tracking ? "btn-secondary" : "btn-primary"}>
          {t(tracking ? "gpsStop" : "gpsStart")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      <div className="mt-4">
        {!points ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t("gpsNoRoute")}</p>
        ) : (
          <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="h-64 w-full rounded-lg bg-gray-50 dark:bg-white/5">
            <polyline points={points.join(" ")} fill="none" stroke="var(--color-brand-500, #465fff)" strokeWidth="2" />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.split(",")[0]}
                cy={p.split(",")[1]}
                r={i === points.length - 1 ? 5 : 2.5}
                fill={i === points.length - 1 ? "#f04438" : "#465fff"}
              />
            ))}
          </svg>
        )}
      </div>
    </section>
  );
}
