"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CrewsPanel } from "@/components/crews-panel";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatDateWithOptions } from "@/lib/format-date";
import { resetStateInEffect } from "@/lib/effect-reset";

type ResourceType = "worker" | "equipment";

interface Project {
  id: string;
  name: string;
}
interface Worker {
  id: string;
  name: string;
}
interface Equipment {
  id: string;
  name: string;
}
interface TaskOption {
  id: string;
  name: string;
}
interface Assignment {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  startDate: string;
  endDate: string;
  note: string | null;
}
interface HeatmapDay {
  date: string;
  hours: number;
  overallocated: boolean;
}
interface HeatmapRow {
  workerId: string;
  workerName: string;
  days: HeatmapDay[];
}
interface ResourceRow {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  subtitle: string | null;
  assignments: Assignment[];
}
interface Conflict {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  assignmentAId: string;
  assignmentBId: string;
  projectAName: string;
  projectBName: string;
  overlapStart: string;
  overlapEnd: string;
}
interface Calendar {
  resources: ResourceRow[];
  conflicts: Conflict[];
}
interface CreateConflict {
  assignmentId: string;
  projectName: string;
  startDate: string;
  endDate: string;
}
interface LevelingMove {
  assignmentId: string;
  projectName: string;
  originalStartDate: string;
  originalEndDate: string;
  newStartDate: string;
  newEndDate: string;
  shiftedByDays: number;
}

const EMPTY_FORM = { resourceType: "worker" as ResourceType, resourceId: "", projectId: "", taskId: "", startDate: "", endDate: "", note: "" };

function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ResourcePlanningPage() {
  const t = useTranslations("resourcePlanning");
  const tc = useTranslations("common");

  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [projectTasks, setProjectTasks] = useState<TaskOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [newAssignmentConflicts, setNewAssignmentConflicts] = useState<CreateConflict[] | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapRow[] | null>(null);
  const [heatmapFrom] = useState(isoDaysFromNow(0));
  const [heatmapTo] = useState(isoDaysFromNow(27));
  const [leveledMoves, setLeveledMoves] = useState<{ resourceKey: string; moves: LevelingMove[] } | null>(null);
  const [levelBusy, setLevelBusy] = useState<string | null>(null);

  function load() {
    apiFetch<Calendar>("/resource-planning/calendar").then(setCalendar);
    apiFetch<HeatmapRow[]>(
      `/resource-planning/workload-heatmap?from=${new Date(heatmapFrom).toISOString()}&to=${new Date(heatmapTo).toISOString()}`,
    ).then(setHeatmap);
  }

  useEffect(() => {
    load();
    apiFetch<Project[]>("/projects").then((list) => {
      setProjects(list);
      setForm((f) => ({ ...f, projectId: f.projectId || (list[0]?.id ?? "") }));
    });
    apiFetch<Worker[]>("/workers").then((list) => {
      setWorkers(list);
      setForm((f) => ({ ...f, resourceId: f.resourceId || (list[0]?.id ?? "") }));
    });
    apiFetch<Equipment[]>("/equipment").then(setEquipment);
  }, []);

  useEffect(() => {
    if (!form.projectId) {
      resetStateInEffect(() => setProjectTasks([]));
      return;
    }
    apiFetch<TaskOption[]>(`/tasks?projectId=${form.projectId}`).then(setProjectTasks);
  }, [form.projectId]);

  function switchResourceType(resourceType: ResourceType) {
    const list = resourceType === "worker" ? workers : equipment;
    setForm((f) => ({ ...f, resourceType, resourceId: list[0]?.id ?? "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.resourceId || !form.projectId || !form.startDate || !form.endDate) return;
    setBusy(true);
    setNewAssignmentConflicts(null);
    try {
      const body = {
        projectId: form.projectId,
        taskId: form.taskId || undefined,
        [form.resourceType === "worker" ? "workerId" : "equipmentId"]: form.resourceId,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        note: form.note || undefined,
      };
      const result = await apiFetch<{ assignment: Assignment; conflicts: CreateConflict[] }>("/resource-planning/assignments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result.conflicts.length > 0) setNewAssignmentConflicts(result.conflicts);
      setForm((f) => ({ ...f, startDate: "", endDate: "", note: "" }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(id: string) {
    if (!window.confirm(t("confirmRemoveAssignment"))) return;
    await apiFetch(`/resource-planning/assignments/${id}`, { method: "DELETE" });
    load();
  }

  async function levelResource(resourceType: ResourceType, resourceId: string) {
    const resourceKey = `${resourceType}-${resourceId}`;
    setLevelBusy(resourceKey);
    setLeveledMoves(null);
    try {
      const result = await apiFetch<{ moves: LevelingMove[] }>("/resource-planning/level", {
        method: "POST",
        body: JSON.stringify({ resourceType, resourceId }),
      });
      setLeveledMoves({ resourceKey, moves: result.moves });
      load();
    } finally {
      setLevelBusy(null);
    }
  }

  const resourceOptions = form.resourceType === "worker" ? workers : equipment;

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>

      <div className="mt-6 card max-w-xl">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("newAssignment")}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("resourceType")}</span>
              <select
                className="input"
                value={form.resourceType}
                onChange={(e) => switchResourceType(e.target.value as ResourceType)}
              >
                <option value="worker">{t("worker")}</option>
                <option value="equipment">{t("equipment")}</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{form.resourceType === "worker" ? t("worker") : t("equipment")}</span>
              <select
                className="input"
                value={form.resourceId}
                disabled={resourceOptions.length === 0}
                onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}
              >
                {resourceOptions.length === 0 && (
                  <option value="">{form.resourceType === "worker" ? t("noWorkers") : t("noEquipment")}</option>
                )}
                {resourceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("project")}</span>
            <select
              className="input"
              value={form.projectId}
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, taskId: "" }))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {projectTasks.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("task")}</span>
              <select className="input" value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))}>
                <option value="">{t("wholeProject")}</option>
                {projectTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("startDate")}</span>
              <input
                required
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{t("endDate")}</span>
              <input
                required
                type="date"
                className="input"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{t("note")}</span>
            <input className="input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy || resourceOptions.length === 0} className="btn-primary self-start">
            {t("assign")}
          </button>
        </form>

        {newAssignmentConflicts && newAssignmentConflicts.length > 0 && (
          <div className="mt-3 rounded-md border border-error-200 bg-error-25 p-3 text-xs text-error-700 dark:text-error-500">
            <p className="font-medium">{t("newAssignmentConflict", { count: newAssignmentConflicts.length })}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {newAssignmentConflicts.map((c) => (
                <li key={c.assignmentId}>
                  {c.projectName}: {formatDate(new Date(c.startDate))} – {formatDate(new Date(c.endDate))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!calendar ? (
        <p className="mt-8 text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : (
        <>
          {calendar.conflicts.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-error-700 dark:text-error-500">{t("conflictsDetected", { count: calendar.conflicts.length })}</h2>
              <ul className="flex flex-col gap-2">
                {calendar.conflicts.map((c, i) => (
                  <li key={i} className="rounded-md border border-error-200 bg-error-25 px-3 py-2 text-sm text-error-700 dark:text-error-500">
                    <span className="font-medium">{c.resourceName}</span> — {c.projectAName} × {c.projectBName}:{" "}
                    {formatDate(new Date(c.overlapStart))} – {formatDate(new Date(c.overlapEnd))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("calendar")}</h2>
          {calendar.resources.every((r) => r.assignments.length === 0) ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noAssignments")}</p>
          ) : (
            <Timeline calendar={calendar} />
          )}

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("allAssignments")}</h2>
          <div className="flex flex-col gap-2">
            {calendar.resources
              .filter((r) => r.assignments.length > 0)
              .map((r) => {
                const resourceKey = `${r.resourceType}-${r.resourceId}`;
                const hasConflict = calendar.conflicts.some((c) => c.resourceType === r.resourceType && c.resourceId === r.resourceId);
                return (
                  <div key={resourceKey} className="card">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-50">
                        <Link href={`/${r.resourceType === "worker" ? "team" : "equipment"}/${r.resourceId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                          {r.resourceName}
                        </Link>{" "}
                        <span className="text-xs text-gray-400 dark:text-gray-500">({t(r.resourceType)})</span>
                      </div>
                      {hasConflict && (
                        <button
                          onClick={() => levelResource(r.resourceType, r.resourceId)}
                          disabled={levelBusy === resourceKey}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          {t("levelSchedule")}
                        </button>
                      )}
                    </div>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {r.assignments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                          <span>
                            <Link href={`/projects/${a.projectId}`} className="text-brand-700 dark:text-brand-400 hover:underline">
                              {a.projectName}
                            </Link>
                            {a.taskName && <span className="text-gray-400 dark:text-gray-500"> / {a.taskName}</span>} —{" "}
                            {formatDate(new Date(a.startDate))} – {formatDate(new Date(a.endDate))}
                            {a.note && <span className="text-gray-400 dark:text-gray-500"> · {a.note}</span>}
                          </span>
                          <button onClick={() => removeAssignment(a.id)} className="text-gray-400 dark:text-gray-500 hover:text-error-600">
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    {leveledMoves && leveledMoves.resourceKey === resourceKey && (
                      <div className="mt-2 rounded-md bg-success-50 dark:bg-success-500/15 px-2.5 py-1.5 text-xs text-success-700 dark:text-success-500">
                        {leveledMoves.moves.length === 0
                          ? t("levelNoChanges")
                          : t("leveledMoves", { count: leveledMoves.moves.length })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("workloadHeatmap")}</h2>
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">{t("workloadHeatmapHint")}</p>
          {!heatmap ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
          ) : heatmap.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("noAssignments")}</p>
          ) : (
            <WorkloadHeatmap rows={heatmap} />
          )}
        </>
      )}

      <CrewsPanel workers={workers} projects={projects} />
    </AuthenticatedShell>
  );
}

function WorkloadHeatmap({ rows }: { rows: HeatmapRow[] }) {
  const t = useTranslations("resourcePlanning");
  const allDates = Array.from(new Set(rows.flatMap((r) => r.days.map((d) => d.date)))).sort();

  function cellFor(row: HeatmapRow, date: string) {
    return row.days.find((d) => d.date === date);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white dark:bg-gray-800 pr-3 text-left font-medium text-gray-500 dark:text-gray-400">{t("worker")}</th>
            {allDates.map((date) => (
              <th key={date} className="px-1 py-1 text-center font-normal text-gray-400 dark:text-gray-500">
                {formatDateWithOptions(date, { day: "numeric", month: "numeric" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workerId}>
              <td className="sticky left-0 bg-white dark:bg-gray-800 pr-3 py-1 font-medium text-gray-700 dark:text-gray-200">{row.workerName}</td>
              {allDates.map((date) => {
                const cell = cellFor(row, date);
                const hours = cell?.hours ?? 0;
                const bg = !cell ? "bg-gray-50 dark:bg-gray-700" : cell.overallocated ? "bg-error-500" : hours >= 8 ? "bg-brand-500" : hours > 0 ? "bg-brand-200" : "bg-gray-50 dark:bg-gray-700";
                return (
                  <td key={date} className="p-0.5">
                    <div
                      className={`h-6 w-6 rounded ${bg}`}
                      title={cell ? `${row.workerName}: ${hours}h${cell.overallocated ? ` (${t("overallocated")})` : ""}` : undefined}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ calendar }: { calendar: Calendar }) {
  const allDates = calendar.resources.flatMap((r) => r.assignments.flatMap((a) => [new Date(a.startDate).getTime(), new Date(a.endDate).getTime()]));
  const min = Math.min(...allDates);
  const max = Math.max(...allDates);
  const span = Math.max(max - min, 24 * 60 * 60 * 1000);
  const pct = (time: number) => ((time - min) / span) * 100;
  const conflictedIds = new Set(calendar.conflicts.flatMap((c) => [c.assignmentAId, c.assignmentBId]));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex flex-col gap-2">
        {calendar.resources
          .filter((r) => r.assignments.length > 0)
          .map((r) => (
            <div key={`${r.resourceType}-${r.resourceId}`} className="flex items-center gap-3">
              <Link
                href={`/${r.resourceType === "worker" ? "team" : "equipment"}/${r.resourceId}`}
                className="w-36 flex-none truncate text-xs text-brand-700 dark:text-brand-400 hover:underline"
              >
                {r.resourceName}
              </Link>
              <div className="relative h-6 min-w-[420px] flex-1 rounded bg-gray-100 dark:bg-gray-700">
                {r.assignments.map((a) => {
                  const left = pct(new Date(a.startDate).getTime());
                  const right = pct(new Date(a.endDate).getTime());
                  const conflicted = conflictedIds.has(a.id);
                  return (
                    <Link
                      key={a.id}
                      href={`/projects/${a.projectId}`}
                      className={`absolute block h-6 overflow-hidden whitespace-nowrap rounded px-1 text-[10px] leading-6 text-white ${
                        conflicted ? "bg-error-500 ring-2 ring-error-700" : "bg-brand-500"
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(right - left, 2)}%` }}
                      title={`${a.projectName}: ${formatDate(new Date(a.startDate))} – ${formatDate(new Date(a.endDate))}`}
                    >
                      {a.projectName}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
