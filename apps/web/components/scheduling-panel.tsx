"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { TASK_DEPENDENCY_TYPES, type TaskDependencyType } from "@cantero/shared";
import { apiFetch } from "@/lib/api-client";
import { CommentsThread } from "@/components/comments-thread";
import { formatDate, formatDateWithOptions } from "@/lib/format-date";

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
  isOutdoorWork: boolean;
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
  const [taskForm, setTaskForm] = useState({ name: "", startDate: "", dueDate: "", isOutdoorWork: false });
  const [milestoneForm, setMilestoneForm] = useState({ name: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [depEditorTaskId, setDepEditorTaskId] = useState<string | null>(null);
  const [depForm, setDepForm] = useState({ predecessorId: "", type: "finish_to_start" as TaskDependencyType, lagDays: "0" });
  const [depError, setDepError] = useState<string | null>(null);
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);

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
          isOutdoorWork: taskForm.isOutdoorWork,
        }),
      });
      setTaskForm({ name: "", startDate: "", dueDate: "", isOutdoorWork: false });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const newStatus = event.over?.id as TaskStatus | undefined;
    if (!newStatus || !STATUSES.includes(newStatus)) return;
    const task = (tasks ?? []).find((t) => t.id === taskId);
    if (task && task.status !== newStatus) moveTask(taskId, newStatus);
  }

  async function changeTaskDates(taskId: string, startDate: Date, dueDate: Date) {
    await apiFetch(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ startDate: startDate.toISOString(), dueDate: dueDate.toISOString() }),
    });
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
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("board")}</h2>
      <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATUSES.map((status) => (
          <DroppableColumn key={status} id={status}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(status)}</div>
            <div className="flex flex-col gap-2">
              {(tasks ?? []).filter((task) => task.status === status).map((task) => (
                <DraggableTaskCard key={task.id} id={task.id}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{task.name}</span>
                    {criticalTaskIds.has(task.id) && (
                      <span className="rounded-full bg-error-50 dark:bg-error-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-700 dark:text-error-500">
                        {t("critical")}
                      </span>
                    )}
                    {task.isOutdoorWork && (
                      <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                        {t("outdoorWork")}
                      </span>
                    )}
                  </div>
                  {(task.startDate || task.dueDate) && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {task.startDate ? formatDate(new Date(task.startDate)) : "…"}
                      {" → "}
                      {task.dueDate ? formatDate(new Date(task.dueDate)) : "…"}
                    </div>
                  )}
                  {task.predecessorLinks.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {task.predecessorLinks.map((link) => (
                        <li key={link.id} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          {t("dependsOn")}: {link.predecessor.name} ({t(`depType_${link.type}`)}
                          {link.lagDays !== 0 ? `${link.lagDays > 0 ? "+" : ""}${link.lagDays}d` : ""})
                          <button onClick={() => removeDependency(link.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
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
                    <button
                      onClick={() => setCommentsTaskId(commentsTaskId === task.id ? null : task.id)}
                      className="btn-secondary px-2 py-0.5 text-xs"
                    >
                      {t("comments")}
                    </button>
                  </div>

                  {depEditorTaskId === task.id && (
                    <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
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

                  {commentsTaskId === task.id && (
                    <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                      <CommentsThread param="taskId" entityId={task.id} />
                    </div>
                  )}
                </DraggableTaskCard>
              ))}
            </div>
          </DroppableColumn>
        ))}
      </div>
      </DndContext>

      <form onSubmit={createTask} className="mt-4 flex flex-wrap items-end gap-2">
        <input
          required
          placeholder={t("taskName")}
          className="input w-auto"
          value={taskForm.name}
          onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))}
        />
        <label className="text-xs text-gray-500 dark:text-gray-400">
          {t("startDate")}
          <input
            type="date"
            className="input mt-1"
            value={taskForm.startDate}
            onChange={(e) => setTaskForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">
          {t("dueDate")}
          <input
            type="date"
            className="input mt-1"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={taskForm.isOutdoorWork}
            onChange={(e) => setTaskForm((f) => ({ ...f, isOutdoorWork: e.target.checked }))}
          />
          {t("outdoorWork")}
        </label>
        <button type="submit" disabled={busy} className="btn-primary">
          {t("newTask")}
        </button>
      </form>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("gantt")}</h2>
      <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">{t("ganttDragHint")}</p>
      <GanttChart
        tasks={tasks ?? []}
        milestones={milestones ?? []}
        emptyLabel={t("noDatedTasks")}
        criticalTaskIds={criticalTaskIds}
        onTaskDatesChange={changeTaskDates}
      />

      <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("milestones")}</h2>
      <ul className="flex flex-col gap-2">
        {(milestones ?? []).map((m) => (
          <li key={m.id} className="card flex items-center justify-between">
            <span className="text-sm font-medium">{m.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{m.dueDate ? formatDate(new Date(m.dueDate)) : "—"}</span>
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

const DAY_MS = 24 * 60 * 60 * 1000;

interface DragState {
  taskId: string;
  mode: "move" | "resize";
  startX: number;
  trackWidth: number;
  originalStart: Date;
  originalDue: Date;
  previewStart: Date;
  previewDue: Date;
}

function GanttChart({
  tasks,
  milestones,
  emptyLabel,
  criticalTaskIds,
  onTaskDatesChange,
}: {
  tasks: Task[];
  milestones: Milestone[];
  emptyLabel: string;
  criticalTaskIds: Set<string>;
  onTaskDatesChange: (taskId: string, startDate: Date, dueDate: Date) => void;
}) {
  const t = useTranslations("scheduling");
  const trackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [drag, setDrag] = useState<DragState | null>(null);

  const datedTasks = tasks.filter((t) => t.startDate && t.dueDate);
  const datedMilestones = milestones.filter((m) => m.dueDate);

  if (datedTasks.length === 0 && datedMilestones.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">{emptyLabel}</p>;
  }

  const now = new Date();
  const allDates = [
    ...datedTasks.flatMap((t) => [new Date(t.startDate!).getTime(), new Date(t.dueDate!).getTime()]),
    ...datedMilestones.map((m) => new Date(m.dueDate!).getTime()),
    now.getTime(),
  ];
  const min = Math.min(...allDates) - DAY_MS;
  const max = Math.max(...allDates) + DAY_MS;
  const span = Math.max(max - min, DAY_MS); // avoid div-by-zero

  const pct = (t: number) => ((t - min) / span) * 100;

  const weekTicks: number[] = [];
  for (let d = new Date(min); d.getTime() <= max; d.setDate(d.getDate() + 7)) weekTicks.push(d.getTime());

  function snapDelta(deltaX: number, trackWidth: number): number {
    const deltaMs = (deltaX / trackWidth) * span;
    return Math.round(deltaMs / DAY_MS) * DAY_MS;
  }

  function handleMoveStart(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    const track = trackRefs.current[task.id];
    if (!track) return;
    startDrag(e, task, "move", track.getBoundingClientRect().width);
  }

  function handleResizeStart(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRefs.current[task.id];
    if (!track) return;
    startDrag(e, task, "resize", track.getBoundingClientRect().width);
  }

  function startDrag(e: React.MouseEvent, task: Task, mode: "move" | "resize", trackWidth: number) {
    const originalStart = new Date(task.startDate!);
    const originalDue = new Date(task.dueDate!);
    const state: DragState = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      trackWidth,
      originalStart,
      originalDue,
      previewStart: originalStart,
      previewDue: originalDue,
    };
    setDrag(state);

    function onMouseMove(ev: MouseEvent) {
      setDrag((prev) => {
        if (!prev) return prev;
        const delta = snapDelta(ev.clientX - prev.startX, prev.trackWidth);
        if (prev.mode === "move") {
          return { ...prev, previewStart: new Date(prev.originalStart.getTime() + delta), previewDue: new Date(prev.originalDue.getTime() + delta) };
        }
        const newDue = new Date(Math.max(prev.originalDue.getTime() + delta, prev.originalStart.getTime() + DAY_MS));
        return { ...prev, previewDue: newDue };
      });
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setDrag((prev) => {
        if (prev && (prev.previewStart.getTime() !== prev.originalStart.getTime() || prev.previewDue.getTime() !== prev.originalDue.getTime())) {
          onTaskDatesChange(prev.taskId, prev.previewStart, prev.previewDue);
        }
        return null;
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {criticalTaskIds.size > 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-500" /> {t("criticalPathLegend")}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-32 flex-none" />
        <div className="relative h-5 flex-1 text-[10px] text-gray-400 dark:text-gray-500">
          {weekTicks.map((tick) => (
            <div key={tick} className="absolute -translate-x-1/2 border-l border-gray-100 dark:border-gray-700 pl-1" style={{ left: `${pct(tick)}%`, height: "100%" }}>
              {formatDateWithOptions(tick, { month: "short", day: "numeric" })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {datedTasks.map((task) => {
          const isDragging = drag?.taskId === task.id;
          const startMs = isDragging ? drag!.previewStart.getTime() : new Date(task.startDate!).getTime();
          const dueMs = isDragging ? drag!.previewDue.getTime() : new Date(task.dueDate!).getTime();
          const left = pct(startMs);
          const right = pct(dueMs);
          const critical = criticalTaskIds.has(task.id);
          return (
            <div key={task.id} className="flex items-center gap-3">
              <div className="w-32 flex-none truncate text-xs text-gray-600 dark:text-gray-300" title={task.name}>
                {task.name}
              </div>
              <div
                ref={(el) => {
                  trackRefs.current[task.id] = el;
                }}
                className="relative h-5 flex-1 rounded bg-gray-100 dark:bg-gray-700"
              >
                <div className="pointer-events-none absolute inset-y-0 border-l border-brand-400" style={{ left: `${pct(now.getTime())}%` }} />
                <div
                  onMouseDown={(e) => handleMoveStart(e, task)}
                  className={`group absolute h-5 cursor-grab select-none rounded active:cursor-grabbing ${
                    critical ? "ring-2 ring-error-500" : ""
                  } ${task.status === "done" ? "bg-green-500" : task.status === "in_progress" ? "bg-amber-500" : "bg-gray-400"} ${
                    isDragging ? "opacity-80" : ""
                  }`}
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }}
                >
                  <div
                    onMouseDown={(e) => handleResizeStart(e, task)}
                    className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-black/10 opacity-0 group-hover:opacity-100"
                  />
                </div>
              </div>
            </div>
          );
        })}
        {datedMilestones.map((m) => {
          const at = pct(new Date(m.dueDate!).getTime());
          return (
            <div key={m.id} className="flex items-center gap-3">
              <div className="w-32 flex-none truncate text-xs text-gray-600 dark:text-gray-300">◆ {m.name}</div>
              <div className="relative h-5 flex-1">
                <div className="absolute h-3 w-3 -translate-x-1/2 rotate-45 bg-gray-900" style={{ left: `${at}%`, top: "4px" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 transition-colors ${isOver ? "border-brand-400 bg-brand-50/40" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700"}`}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({ id, children }: { id: string; children: React.ReactNode }) {
  const t = useTranslations("scheduling");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`card relative ${isDragging ? "z-10 opacity-80 shadow-theme-md" : ""}`}>
      <button
        {...listeners}
        {...attributes}
        type="button"
        title={t("dragToMove")}
        className="absolute right-2 top-2 cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="6" cy="5" r="1.3" />
          <circle cx="6" cy="10" r="1.3" />
          <circle cx="6" cy="15" r="1.3" />
          <circle cx="12" cy="5" r="1.3" />
          <circle cx="12" cy="10" r="1.3" />
          <circle cx="12" cy="15" r="1.3" />
        </svg>
      </button>
      {children}
    </div>
  );
}
