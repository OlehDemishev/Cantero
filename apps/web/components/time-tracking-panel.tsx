"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";
import { useCrewChoices } from "@/lib/permissions";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Worker {
  id: string;
  name: string;
  userId: string | null;
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
  withinGeofence: boolean | null;
}

export function TimeTrackingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");

  const TIME_ENTRIES_PAGE_SIZE = 100;
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({
    workerId: "",
    taskId: "",
    hours: "1",
    date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  function load() {
    apiFetch<TimeEntry[]>(`/time-entries?projectId=${projectId}`).then(
      (page) => {
        setEntries(page);
        setHasMore(page.length === TIME_ENTRIES_PAGE_SIZE);
      },
    );
  }

  async function loadMore() {
    if (!entries || entries.length === 0) return;
    setLoadMoreBusy(true);
    try {
      const page = await apiFetch<TimeEntry[]>(
        `/time-entries?projectId=${projectId}&cursor=${entries[entries.length - 1].id}`,
      );
      setEntries([...entries, ...page]);
      setHasMore(page.length === TIME_ENTRIES_PAGE_SIZE);
    } finally {
      setLoadMoreBusy(false);
    }
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`).then(setTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const { crew, choices, initialId } = useCrewChoices(workers, "time");
  // Keep the pick on a worker this member may record for (their own record unless they run the crew).
  useEffect(() => {
    if (choices.some((w) => w.id === form.workerId)) return;
    resetStateInEffect(() => setForm((f) => ({ ...f, workerId: initialId })));
  }, [choices, initialId, form.workerId]);

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    setEditHours(entry.hours);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/time-entries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ hours: Number(editHours) }),
      });
      setEditingId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!window.confirm(t("confirmDeleteEntry"))) return;
    setBusy(true);
    try {
      await apiFetch(`/time-entries/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

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
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {t("timeEntries")}
      </h2>
      {!entries ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {tc("loading")}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {t("noTimeEntries")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-gray-100 dark:border-gray-700"
                >
                  <td className="py-1">{formatDate(new Date(entry.date))}</td>
                  <td>{entry.worker.name}</td>
                  <td>{entry.task?.name ?? "—"}</td>
                  <td>
                    {entry.withinGeofence === false && (
                      <span className="rounded-full bg-warning-50 dark:bg-warning-500/15 px-2 py-0.5 text-xs font-medium text-warning-700 dark:text-warning-500">
                        {t("outsideGeofence")}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    {editingId === entry.id ? (
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        className="input w-20 text-right"
                        value={editHours}
                        onChange={(e) => setEditHours(e.target.value)}
                      />
                    ) : (
                      `${entry.hours}h`
                    )}
                  </td>
                  <td className="py-1 pl-2 text-right text-xs">
                    {editingId === entry.id ? (
                      <button
                        onClick={() => saveEdit(entry.id)}
                        disabled={busy}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {tc("save")}
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(entry)}
                        disabled={busy}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {tc("edit")}
                      </button>
                    )}
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      disabled={busy}
                      className="ml-2 text-error-700 dark:text-error-500 hover:underline"
                    >
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadMoreBusy}
              className="btn-secondary mt-3 px-2.5 py-1.5 text-xs"
            >
              {tc("loadMore")}
            </button>
          )}
        </div>
      )}

      {choices.length > 0 && (
        <form
          onSubmit={logTime}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <select
            className="input w-auto"
            value={form.workerId}
            disabled={!crew}
            onChange={(e) =>
              setForm((f) => ({ ...f, workerId: e.target.value }))
            }
          >
            {choices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={form.taskId}
            onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}
          >
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
