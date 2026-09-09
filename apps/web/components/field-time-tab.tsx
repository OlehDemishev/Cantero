"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached } from "@/lib/offline-cache";
import { resetStateInEffect } from "@/lib/effect-reset";
import { FieldMessage, type FieldMessageType } from "@/components/field-message";

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

export function TimeTab({ projectId, meUserId }: { projectId: string; meUserId: string }) {
  const t = useTranslations("field");
  const tt = useTranslations("team");
  const tc = useTranslations("common");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ workerId: "", taskId: "", hours: "8", date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: FieldMessageType; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCached<Worker[]>("field:workers", "/workers")
      .then(({ data: list }) => {
        setWorkers(list);
        const mine = list.find((w) => w.userId === meUserId);
        setForm((f) => ({ ...f, workerId: (mine ?? list[0])?.id ?? "" }));
      })
      .catch(() => setError(true));

  }, [meUserId]);

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

  if (error) return <p className="text-sm text-gray-400 dark:text-gray-500">{t("offline")}</p>;
  if (workers.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>;

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{tt("worker")}</span>
        <select className="input" value={form.workerId} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-200">{tt("task")}</span>
        <select className="input" value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
          <option value="">{tt("noneTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{tt("hours")}</span>
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            className="input"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{tt("date")}</span>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </label>
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {t("logTimeButton")}
      </button>
      {message && <FieldMessage type={message.type} text={message.text} />}
    </form>
  );
}
