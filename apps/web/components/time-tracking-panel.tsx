"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface Worker {
  id: string;
  name: string;
}
interface Task {
  id: string;
  name: string;
}
interface TimeEntry {
  id: string;
  hours: string;
  date: string;
  worker: Worker;
  task: Task | null;
}

export function TimeTrackingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({ workerId: "", taskId: "", hours: "1", date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<TimeEntry[]>(`/time-entries?projectId=${projectId}`).then(setEntries);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then((list) => {
      setWorkers(list);
      if (list[0]) setForm((f) => ({ ...f, workerId: list[0].id }));
    });
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`).then(setTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function logTime(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerId) return;
    setBusy(true);
    try {
      await apiFetch("/time-entries", {
        method: "POST",
        body: JSON.stringify({
          workerId: form.workerId,
          projectId,
          taskId: form.taskId || undefined,
          hours: Number(form.hours),
          date: new Date(form.date).toISOString(),
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("timeEntries")}</h2>
      {!entries ? (
        <p className="text-sm text-gray-400">{tc("loading")}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400">{t("noTimeEntries")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-100">
                <td className="py-1">{new Date(entry.date).toLocaleDateString()}</td>
                <td>{entry.worker.name}</td>
                <td>{entry.task?.name ?? "—"}</td>
                <td className="text-right">{entry.hours}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {workers.length > 0 && (
        <form onSubmit={logTime} className="mt-4 flex flex-wrap items-end gap-2">
          <select className="input w-auto" value={form.workerId} onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
            <option value="">{t("noneTask")}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            className="input w-20"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
          />
          <input
            type="date"
            className="input w-auto"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <button type="submit" disabled={busy} className="btn-secondary">
            {t("logTime")}
          </button>
        </form>
      )}
    </div>
  );
}
