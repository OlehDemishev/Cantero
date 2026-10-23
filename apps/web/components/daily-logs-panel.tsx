"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WEATHER_CONDITIONS, type WeatherCondition } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoAttachments } from "@/components/photo-attachments";
import { VoiceInputButton } from "@/components/voice-input-button";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/field";

interface DailyLog {
  id: string;
  date: string;
  authorName: string;
  weatherCondition: WeatherCondition | null;
  weatherNotes: string | null;
  weatherDelayHours: number | null;
  crewCount: number | null;
  crewNotes: string | null;
  workPerformed: string;
  delays: string | null;
  notes: string | null;
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  weatherCondition: "" as WeatherCondition | "",
  weatherNotes: "",
  weatherDelayHours: "",
  crewCount: "",
  crewNotes: "",
  workPerformed: "",
  delays: "",
  notes: "",
};

export function DailyLogsPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("dailyLogs");
  const tc = useTranslations("common");

  const { data: logs = null, reload: reloadLogs, error: logsError } = useApi<DailyLog[]>(`/daily-logs?projectId=${projectId}`);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    void reloadLogs();
  }

  function startEdit(log: DailyLog) {
    setEditingId(log.id);
    setCreating(false);
    setError(null);
    setForm({
      date: log.date.slice(0, 10),
      weatherCondition: log.weatherCondition ?? "",
      weatherNotes: log.weatherNotes ?? "",
      weatherDelayHours: log.weatherDelayHours?.toString() ?? "",
      crewCount: log.crewCount?.toString() ?? "",
      crewNotes: log.crewNotes ?? "",
      workPerformed: log.workPerformed,
      delays: log.delays ?? "",
      notes: log.notes ?? "",
    });
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setError(null);
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      weatherCondition: form.weatherCondition || undefined,
      weatherNotes: form.weatherNotes || undefined,
      weatherDelayHours: form.weatherDelayHours ? Number(form.weatherDelayHours) : undefined,
      crewCount: form.crewCount ? Number(form.crewCount) : undefined,
      crewNotes: form.crewNotes || undefined,
      workPerformed: form.workPerformed,
      delays: form.delays || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await apiFetch(`/daily-logs/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/daily-logs", {
          method: "POST",
          body: JSON.stringify({ ...body, projectId, date: new Date(form.date).toISOString() }),
        });
      }
      setCreating(false);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const showForm = creating || editingId !== null;

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!showForm && (
          <button onClick={startCreate} className="btn-secondary px-3 py-1 text-xs">
            {t("newLog")}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card mb-4 flex flex-col gap-3">
          {!editingId && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("date")}</span>
              <input
                type="date"
                required
                className="input w-auto"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
          )}
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("weather")}</span>
              <select
                className="input"
                value={form.weatherCondition}
                onChange={(e) => setForm((f) => ({ ...f, weatherCondition: e.target.value as WeatherCondition | "" }))}
              >
                <option value="">{tc("none")}</option>
                {WEATHER_CONDITIONS.map((w) => (
                  <option key={w} value={w}>
                    {t(`weather_${w}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("weatherNotes")}</span>
              <input
                className="input"
                placeholder={t("weatherNotesPlaceholder")}
                value={form.weatherNotes}
                onChange={(e) => setForm((f) => ({ ...f, weatherNotes: e.target.value }))}
              />
            </label>
            <label className="flex w-40 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("weatherDelayHours")}</span>
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                className="input"
                value={form.weatherDelayHours}
                onChange={(e) => setForm((f) => ({ ...f, weatherDelayHours: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="flex w-32 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("crewCount")}</span>
              <input
                type="number"
                min="0"
                className="input"
                value={form.crewCount}
                onChange={(e) => setForm((f) => ({ ...f, crewCount: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-fg-muted">{t("crewNotes")}</span>
              <input
                className="input"
                placeholder={t("crewNotesPlaceholder")}
                value={form.crewNotes}
                onChange={(e) => setForm((f) => ({ ...f, crewNotes: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-2 font-medium text-fg-muted">
              {t("workPerformed")}
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
            <span className="font-medium text-fg-muted">{t("delays")}</span>
            <textarea
              rows={2}
              className="input"
              placeholder={t("delaysPlaceholder")}
              value={form.delays}
              onChange={(e) => setForm((f) => ({ ...f, delays: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-fg-muted">{t("notes")}</span>
            <textarea
              rows={2}
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          {error && <FormError>{error}</FormError>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {logs === null ? (
        logsError ? <ErrorState error={logsError} onRetry={reloadLogs} compact /> : <Skeleton lines={3} />
      ) : logs.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noLogs")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const expanded = expandedId === log.id;
            return (
              <li key={log.id} className="card">
                <button
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-fg">
                      {formatDate(new Date(log.date))}
                    </span>
                    {log.weatherCondition && (
                      <Badge tone="neutral">
                        {t(`weather_${log.weatherCondition}`)}
                      </Badge>
                    )}
                    {log.delays && (
                      <Badge tone="warning">
                        {t("hasDelays")}
                      </Badge>
                    )}
                    {!!log.weatherDelayHours && (
                      <Badge tone="warning">
                        {t("weatherDelayBadge", { hours: log.weatherDelayHours })}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-fg-subtle">{log.authorName}</span>
                </button>
                <p className="mt-1.5 truncate text-xs text-fg-subtle">{log.workPerformed}</p>
                {expanded && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-3 text-sm">
                    {log.crewCount !== null && (
                      <p>
                        <span className="font-medium text-fg-muted">{t("crewCount")}: </span>
                        {log.crewCount}
                        {log.crewNotes ? ` — ${log.crewNotes}` : ""}
                      </p>
                    )}
                    {log.weatherNotes && (
                      <p>
                        <span className="font-medium text-fg-muted">{t("weatherNotes")}: </span>
                        {log.weatherNotes}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-fg-muted">{t("workPerformed")}: </span>
                      {log.workPerformed}
                    </p>
                    {log.delays && (
                      <p>
                        <span className="font-medium text-fg-muted">{t("delays")}: </span>
                        {log.delays}
                      </p>
                    )}
                    {log.notes && (
                      <p>
                        <span className="font-medium text-fg-muted">{t("notes")}: </span>
                        {log.notes}
                      </p>
                    )}
                    <PhotoAttachments param="dailyLogId" entityId={log.id} />
                    <button onClick={() => startEdit(log)} className="btn-secondary mt-1 w-fit px-3 py-1 text-xs">
                      {tc("edit")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
