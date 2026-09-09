"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WEATHER_CONDITIONS, type WeatherCondition } from "@cantero/shared";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { formatDate } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";
import { VoiceInputButton } from "@/components/voice-input-button";
import { CachedNote } from "@/components/field-cached-note";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";

interface DailyLog {
  id: string;
  date: string;
  weatherCondition: WeatherCondition | null;
  crewCount: number | null;
  workPerformed: string;
  delays: string | null;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function LogsTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const td = useTranslations("dailyLogs");
  const tc = useTranslations("common");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState({ weatherCondition: "" as WeatherCondition | "", crewCount: "", workPerformed: "", delays: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  useEffect(() => {
    resetStateInEffect(() => {
      setLoaded(false);
      setExistingId(null);
      setCachedAt(null);
      setForm({ weatherCondition: "", crewCount: "", workPerformed: "", delays: "" });
    });
    fetchCached<DailyLog[]>(`field:daily-logs:${projectId}`, `/daily-logs?projectId=${projectId}`)
      .then(({ data: list, stale, cachedAt: at }) => {
        setCachedAt(stale ? at : null);
        const today = list.find((l) => l.date.slice(0, 10) === TODAY);
        if (today) {
          setExistingId(today.id);
          setForm({
            weatherCondition: today.weatherCondition ?? "",
            crewCount: today.crewCount?.toString() ?? "",
            workPerformed: today.workPerformed,
            delays: today.delays ?? "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body = {
      weatherCondition: form.weatherCondition || undefined,
      crewCount: form.crewCount ? Number(form.crewCount) : undefined,
      workPerformed: form.workPerformed,
      delays: form.delays || undefined,
    };
    try {
      const { queued } = existingId
        ? await submitOrQueue("daily-log", `/daily-logs/${existingId}`, "PATCH", body)
        : await submitOrQueue("daily-log", "/daily-logs", "POST", { ...body, projectId, date: new Date().toISOString() });
      setMessage({ type: "success", text: queued ? t("queuedOffline") : tc("saved") });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <CachedNote cachedAt={cachedAt} />
      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(new Date())}</p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{td("weather")}</span>
        <select
          className="input"
          value={form.weatherCondition}
          onChange={(e) => setForm((f) => ({ ...f, weatherCondition: e.target.value as WeatherCondition | "" }))}
        >
          <option value="">{tc("none")}</option>
          {WEATHER_CONDITIONS.map((w) => (
            <option key={w} value={w}>
              {td(`weather_${w}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{td("crewCount")}</span>
        <input
          type="number"
          min="0"
          className="input"
          value={form.crewCount}
          onChange={(e) => setForm((f) => ({ ...f, crewCount: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-200">
          {td("workPerformed")}
          <VoiceInputButton
            onTranscript={(text) => setForm((f) => ({ ...f, workPerformed: f.workPerformed ? `${f.workPerformed} ${text}` : text }))}
          />
        </span>
        <textarea
          required
          rows={3}
          className="input"
          value={form.workPerformed}
          onChange={(e) => setForm((f) => ({ ...f, workPerformed: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{td("delays")}</span>
        <textarea
          rows={2}
          className="input"
          value={form.delays}
          onChange={(e) => setForm((f) => ({ ...f, delays: e.target.value }))}
        />
      </label>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {existingId ? tc("save") : td("newLog")}
      </button>
      {message && <FieldMessage type={message.type} text={message.text} />}
    </form>
  );
}
