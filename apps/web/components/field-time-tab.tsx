"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { resetStateInEffect } from "@/lib/effect-reset";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";
import { useCrewChoices } from "@/lib/permissions";
import { Field } from "@/components/ui/field";

interface Worker {
  id: string;
  name: string;
  userId: string | null;
}
interface Task {
  id: string;
  name: string;
}

/** Best-effort current position — resolves null (never rejects) on denial, timeout, or an unsupported browser, so logging time never blocks on location. */
function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

const NO_WORKERS: Worker[] = [];

export function TimeTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ workerId: "", taskId: "", hours: "8", date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
      })
      .catch(() => setError(true));
  }, []);

  const { crew, choices, initialId } = useCrewChoices(workers ?? NO_WORKERS, "time");
  // Keep the pick on a worker this member may record for (their own record unless they run the crew).
  useEffect(() => {
    if (choices.some((w) => w.id === form.workerId)) return;
    resetStateInEffect(() => setForm((f) => ({ ...f, workerId: initialId })));
  }, [choices, initialId, form.workerId]);

  useEffect(() => {
    fetchCached<Task[]>(`field:tasks:${projectId}`, `/tasks?projectId=${projectId}`)
      .then(({ data }) => setTasks(data))
      .catch(() => setError(true));
    resetStateInEffect(() => setForm((f) => ({ ...f, taskId: "" })));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId) return;
    setBusy(true);
    setMessage(null);
    try {
      const position = await getCurrentPositionSafe();
      const { queued, data } = await submitOrQueue<{ withinGeofence: boolean | null }>("time-entry", "/time-entries", "POST", {
        workerId: form.workerId,
        projectId,
        taskId: form.taskId || undefined,
        hours: Number(form.hours),
        date: new Date(form.date).toISOString(),
        clockInLat: position?.lat,
        clockInLng: position?.lng,
      });
      if (queued) {
        setMessage({ type: "success", text: t("queuedOffline") });
      } else if (data?.withinGeofence === false) {
        setMessage({ type: "warning", text: t("loggedOutsideGeofence") });
      } else {
        setMessage({ type: "success", text: tc("saved") });
      }
      setForm((f) => ({ ...f, hours: "8" }));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : tc("error") });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-fg-subtle">{t("offline")}</p>;
  if (workers === null) return <p className="text-sm text-fg-subtle">{tc("loading")}</p>;
  if (choices.length === 0) return <p className="text-sm text-fg-subtle">{t(crew ? "noWorkers" : "noOwnWorker")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <Field label={tt("worker")}>
        <select className="input" value={form.workerId} disabled={!crew} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
          {choices.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tt("task")}>
        <select className="input" value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
          <option value="">{tt("noneTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-3">
        <Field label={tt("hours")} className="flex-1">
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            className="input"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
          />
        </Field>
        <Field label={tt("date")} className="flex-1">
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </Field>
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {t("logTimeButton")}
      </button>
      {message && <FieldMessage type={message.type} text={message.text} />}
    </form>
  );
}
