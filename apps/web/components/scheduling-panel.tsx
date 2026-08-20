"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TASK_DEPENDENCY_TYPES, type TaskDependencyType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";

type TaskStatus = "planned" | "in_progress" | "done";
const STATUSES: TaskStatus[] = ["planned", "in_progress", "done"];

interface DependencyLink {
  id: string;
  type: TaskDependencyType;
  lagDays: number;
  predecessor: { id: string; name: string };
}
interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  predecessorLinks: DependencyLink[];
}
interface Milestone {
  id: string;
  name: string;
  dueDate: string | null;
}
interface CpmResult {
  id: string;
  slackDays: number;
  critical: boolean;
}

export function SchedulingPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduling");
  const tc = useTranslations("common");

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [criticalPath, setCriticalPath] = useState<CpmResult[]>([]);
  const [taskForm, setTaskForm] = useState({ name: "", startDate: "", dueDate: "" });
  const [milestoneForm, setMilestoneForm] = useState({ name: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [depEditorTaskId, setDepEditorTaskId] = useState<string | null>(null);
  const [depForm, setDepForm] = useState({ predecessorId: "", type: "finish_to_start" as TaskDependencyType, lagDays: "0" });
  const [depError, setDepError] = useState<string | null>(null);

  function load() {
    apiFetch<Task[]>(`/tasks?projectId=${projectId}`).then(setTasks);
    apiFetch<Milestone[]>(`/milestones?projectId=${projectId}`).then(setMilestones);
    apiFetch<CpmResult[]>(`/tasks/critical-path?projectId=${projectId}`).then(setCriticalPath);
  }

  useEffect(load, [projectId]);

  const criticalTaskIds = new Set(criticalPath.filter((r) => r.critical).map((r) => r.id));

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

  function openDepEditor(taskId: string) {
    setDepEditorTaskId(depEditorTaskId === taskId ? null : taskId);
    setDepForm({ predecessorId: "", type: "finish_to_start", lagDays: "0" });
    setDepError(null);
  }

  async function addDependency(taskId: string) {
    if (!depForm.predecessorId) return;
    setDepError(null);
    try {
      await apiFetch(`/tasks/${taskId}/dependencies`, {
        method: "POST",
        body: JSON.stringify({ predecessorId: depForm.predecessorId, type: depForm.type, lagDays: Number(depForm.lagDays) }),
      });
      setDepEditorTaskId(null);
      load();
    } catch (err) {
      setDepError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeDependency(dependencyId: string) {
    await apiFetch(`/tasks/dependencies/${dependencyId}`, { method: "DELETE" });
    load();
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{task.name}</span>
                    {criticalTaskIds.has(task.id) && (
                      <span className="rounded-full bg-error-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-700">
                        {t("critical")}
                      </span>
                    )}
                  </div>
                  {(task.startDate || task.dueDate) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {task.startDate ? new Date(task.startDate).toLocaleDateString() : "…"}
                      {" → "}
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "…"}
                    </div>
                  )}
                  {task.predecessorLinks.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {task.predecessorLinks.map((link) => (
                        <li key={link.id} className="flex items-center gap-1 text-xs text-gray-500">
                          {t("dependsOn")}: {link.predecessor.name} ({t(`depType_${link.type}`)}
                          {link.lagDays !== 0 ? `${link.lagDays > 0 ? "+" : ""}${link.lagDays}d` : ""})
                          <button onClick={() => removeDependency(link.id)} className="text-gray-400 hover:text-error-600">
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {STATUSES.filter((s) => s !== status).map((s) => (
                      <button key={s} onClick={() => moveTask(task.id, s)} className="btn-secondary px-2 py-0.5 text-xs">
                        → {t(s)}
                      </button>
                    ))}
                    <button onClick={() => openDepEditor(task.id)} className="btn-secondary px-2 py-0.5 text-xs">
                      {t("addDependency")}
                    </button>
                  </div>

                  {depEditorTaskId === task.id && (
                    <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 pt-2">
                      <select
                        className="input py-1 text-xs"
                        value={depForm.predecessorId}
                        onChange={(e) => setDepForm((f) => ({ ...f, predecessorId: e.target.value }))}
                      >
                        <option value="">{t("selectPredecessor")}</option>
                        {(tasks ?? [])
                          .filter((other) => other.id !== task.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                      </select>
                      <div className="flex gap-1.5">
                        <select
                          className="input py-1 text-xs"
                          value={depForm.type}
                          onChange={(e) => setDepForm((f) => ({ ...f, type: e.target.value as TaskDependencyType }))}
                        >
                          {TASK_DEPENDENCY_TYPES.map((dt) => (
                            <option key={dt} value={dt}>
                              {t(`depType_${dt}`)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          className="input w-16 py-1 text-xs"
                          value={depForm.lagDays}
                          onChange={(e) => setDepForm((f) => ({ ...f, lagDays: e.target.value }))}
                        />
                      </div>
                      {depError && <p className="text-xs text-error-600">{depError}</p>}
                      <button onClick={() => addDependency(task.id)} className="btn-primary px-2 py-1 text-xs">
                        {tc("save")}
                      </button>
                    </div>
                  )}
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
      <GanttChart tasks={tasks ?? []} milestones={milestones ?? []} emptyLabel={t("noDatedTasks")} criticalTaskIds={criticalTaskIds} />

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

function GanttChart({
  tasks,
  milestones,
  emptyLabel,
  criticalTaskIds,
}: {
  tasks: Task[];
  milestones: Milestone[];
  emptyLabel: string;
  criticalTaskIds: Set<string>;
}) {
  const t = useTranslations("scheduling");
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
      {criticalTaskIds.size > 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-500" /> {t("criticalPathLegend")}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {datedTasks.map((task) => {
          const left = pct(new Date(task.startDate!).getTime());
          const right = pct(new Date(task.dueDate!).getTime());
          const critical = criticalTaskIds.has(task.id);
          return (
            <div key={task.id} className="flex items-center gap-3">
              <div className="w-32 flex-none truncate text-xs text-gray-600">{task.name}</div>
              <div className="relative h-4 flex-1 rounded bg-gray-100">
                <div
                  className={`absolute h-4 rounded ${critical ? "ring-2 ring-error-500" : ""} ${
                    task.status === "done" ? "bg-green-500" : task.status === "in_progress" ? "bg-amber-500" : "bg-gray-400"
                  }`}
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
