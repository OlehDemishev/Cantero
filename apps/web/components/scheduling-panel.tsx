"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type TaskStatus = "planned" | "in_progress" | "done";
const STATUSES: TaskStatus[] = ["planned", "in_progress", "done"];

interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
}
interface Milestone {
  id: string;
  name: string;
  dueDate: string | null;
}

export function SchedulingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduling");
  const tc = useTranslations("common");

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [taskForm, setTaskForm] = useState({ name: "", startDate: "", dueDate: "" });
  const [milestoneForm, setMilestoneForm] = useState({ name: "", dueDate: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`).then(setTasks);
    apiFetch<Milestone[]>(`/milestones?projectId=${projectId}`).then(setMilestones);
  }

  useEffect(load, [projectId]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name: taskForm.name,
          startDate: taskForm.startDate ? new Date(taskForm.startDate).toISOString() : undefined,
          dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : undefined,
        }),
      });
      setTaskForm({ name: "", startDate: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  async function createMilestone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/milestones", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name: milestoneForm.name,
          dueDate: milestoneForm.dueDate ? new Date(milestoneForm.dueDate).toISOString() : undefined,
        }),
      });
      setMilestoneForm({ name: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("board")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATUSES.map((status) => (
          <div key={status} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(status)}</div>
            <div className="flex flex-col gap-2">
              {(tasks ?? []).filter((task) => task.status === status).map((task) => (
                <div key={task.id} className="card">
                  <div className="text-sm font-medium">{task.name}</div>
                  {(task.startDate || task.dueDate) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {task.startDate ? new Date(task.startDate).toLocaleDateString() : "…"}
                      {" → "}
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "…"}
                    </div>
                  )}
                  <div className="mt-2 flex gap-1">
                    {STATUSES.filter((s) => s !== status).map((s) => (
                      <button key={s} onClick={() => moveTask(task.id, s)} className="btn-secondary px-2 py-0.5 text-xs">
                        → {t(s)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={createTask} className="mt-4 flex flex-wrap items-end gap-2">
        <input
          required
          placeholder={t("taskName")}
          className="input w-auto"
          value={taskForm.name}
          onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))}
        />
        <label className="text-xs text-gray-500">
          {t("startDate")}
          <input
            type="date"
            className="input mt-1"
            value={taskForm.startDate}
            onChange={(e) => setTaskForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-500">
          {t("dueDate")}
          <input
            type="date"
            className="input mt-1"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {t("newTask")}
        </button>
      </form>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("gantt")}</h2>
      <GanttChart tasks={tasks ?? []} milestones={milestones ?? []} emptyLabel={t("noDatedTasks")} />

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("milestones")}</h2>
      <ul className="flex flex-col gap-2">
        {(milestones ?? []).map((m) => (
          <li key={m.id} className="card flex items-center justify-between">
            <span className="text-sm font-medium">{m.name}</span>
            <span className="text-xs text-gray-500">{m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={createMilestone} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          required
          placeholder={tc("name")}
          className="input w-auto"
          value={milestoneForm.name}
          onChange={(e) => setMilestoneForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          type="date"
          className="input w-auto"
          value={milestoneForm.dueDate}
          onChange={(e) => setMilestoneForm((f) => ({ ...f, dueDate: e.target.value }))}
        />
        <button type="submit" disabled={busy} className="btn-secondary">
          {t("newMilestone")}
        </button>
      </form>
    </div>
  );
}

function GanttChart({ tasks, milestones, emptyLabel }: { tasks: Task[]; milestones: Milestone[]; emptyLabel: string }) {
  const datedTasks = tasks.filter((t) => t.startDate && t.dueDate);
  const datedMilestones = milestones.filter((m) => m.dueDate);

  if (datedTasks.length === 0 && datedMilestones.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  const allDates = [
    ...datedTasks.flatMap((t) => [new Date(t.startDate!).getTime(), new Date(t.dueDate!).getTime()]),
    ...datedMilestones.map((m) => new Date(m.dueDate!).getTime()),
  ];
  const min = Math.min(...allDates);
  const max = Math.max(...allDates);
  const span = Math.max(max - min, 1000 * 60 * 60 * 24); // at least one day, avoid div-by-zero

  const pct = (t: number) => ((t - min) / span) * 100;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-2">
        {datedTasks.map((task) => {
          const left = pct(new Date(task.startDate!).getTime());
          const right = pct(new Date(task.dueDate!).getTime());
          return (
            <div key={task.id} className="flex items-center gap-3">
              <div className="w-32 flex-none truncate text-xs text-gray-600">{task.name}</div>
              <div className="relative h-4 flex-1 rounded bg-gray-100">
                <div
                  className={`absolute h-4 rounded ${task.status === "done" ? "bg-green-500" : task.status === "in_progress" ? "bg-amber-500" : "bg-gray-400"}`}
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }}
                />
              </div>
            </div>
          );
        })}
        {datedMilestones.map((m) => {
          const at = pct(new Date(m.dueDate!).getTime());
          return (
            <div key={m.id} className="flex items-center gap-3">
              <div className="w-32 flex-none truncate text-xs text-gray-600">◆ {m.name}</div>
              <div className="relative h-4 flex-1">
                <div className="absolute h-3 w-3 -translate-x-1/2 rotate-45 bg-gray-900" style={{ left: `${at}%`, top: "2px" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
