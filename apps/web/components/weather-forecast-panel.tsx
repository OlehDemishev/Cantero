"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { WeatherCondition } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

interface ForecastDay {
  date: string;
  condition: WeatherCondition;
  tempMaxC: number;
  tempMinC: number;
  risky: boolean;
}

interface ForecastResponse {
  available: boolean;
  days: ForecastDay[];
}

const CONDITION_ICON: Record<WeatherCondition, string> = {
  clear: "☀️",
  cloudy: "☁️",
  rain: "🌧️",
  snow: "❄️",
  extreme_heat: "🥵",
  extreme_cold: "🥶",
  other: "⛈️",
};

export function WeatherForecastPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("weather");
  const td = useTranslations("dailyLogs");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);

  useEffect(() => {
    apiFetch<ForecastResponse>(`/projects/${projectId}/weather-forecast`)
      .then(setForecast)
      .catch(() => setForecast({ available: false, days: [] }));
  }, [projectId]);

  if (!forecast || !forecast.available || forecast.days.length === 0) return null;

  const days = forecast.days.slice(0, 5);
  const riskyDays = days.filter((d) => d.risky);

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("title")}</h2>
      {riskyDays.length > 0 && (
        <p className="mb-2 text-xs font-medium text-warning-700">{t("riskWarning", { count: riskyDays.length })}</p>
      )}
      <div className="flex gap-2 overflow-x-auto">
        {days.map((day) => (
          <div
            key={day.date}
            className={`card flex min-w-[100px] flex-col items-center gap-1 px-3 py-2.5 ${day.risky ? "border-warning-200 bg-warning-50" : ""}`}
          >
            <span className="text-xs text-gray-500">
              {new Date(day.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className="text-xl">{CONDITION_ICON[day.condition]}</span>
            <span className="text-xs text-gray-600">{td(`weather_${day.condition}`)}</span>
            <span className="text-xs font-medium text-gray-800 tabular-nums">
              {Math.round(day.tempMinC)}° / {Math.round(day.tempMaxC)}°
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
