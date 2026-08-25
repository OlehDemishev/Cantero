"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { apiFetch } from "@/lib/api-client";

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
      setProjectTasks([]);
      return;
    }
    apiFetch<TaskOption[]>(`/tasks?projectId=${form.projectId}`).then(setProjectTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    await apiFetch(`/resource-planning/assignments/${id}`, { method: "DELETE" });
    load();
  }

  const resourceOptions = form.resourceType === "worker" ? workers : equipment;

  return (
    <AuthenticatedShell>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>

      <div className="mt-6 card max-w-xl">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">{t("newAssignment")}</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("resourceType")}</span>
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
              <span className="font-medium text-gray-700">{form.resourceType === "worker" ? t("worker") : t("equipment")}</span>
              <select className="input" value={form.resourceId} onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}>
                {resourceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700">{t("project")}</span>
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
              <span className="font-medium text-gray-700">{t("task")}</span>
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
              <span className="font-medium text-gray-700">{t("startDate")}</span>
              <input
                required
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium text-gray-700">{t("endDate")}</span>
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
            <span className="font-medium text-gray-700">{t("note")}</span>
            <input className="input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy} className="btn-primary self-start">
            {t("assign")}
          </button>
        </form>

        {newAssignmentConflicts && newAssignmentConflicts.length > 0 && (
          <div className="mt-3 rounded-md border border-error-200 bg-error-25 p-3 text-xs text-error-700">
            <p className="font-medium">{t("newAssignmentConflict", { count: newAssignmentConflicts.length })}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {newAssignmentConflicts.map((c) => (
                <li key={c.assignmentId}>
                  {c.projectName}: {new Date(c.startDate).toLocaleDateString()} – {new Date(c.endDate).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!calendar ? (
        <p className="mt-8 text-gray-500">{tc("loading")}</p>
      ) : (
        <>
          {calendar.conflicts.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-error-700">{t("conflictsDetected", { count: calendar.conflicts.length })}</h2>
              <ul className="flex flex-col gap-2">
                {calendar.conflicts.map((c, i) => (
                  <li key={i} className="rounded-md border border-error-200 bg-error-25 px-3 py-2 text-sm text-error-700">
                    <span className="font-medium">{c.resourceName}</span> — {c.projectAName} × {c.projectBName}:{" "}
                    {new Date(c.overlapStart).toLocaleDateString()} – {new Date(c.overlapEnd).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">{t("calendar")}</h2>
          {calendar.resources.every((r) => r.assignments.length === 0) ? (
            <p className="text-sm text-gray-400">{t("noAssignments")}</p>
          ) : (
            <Timeline calendar={calendar} />
          )}

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("allAssignments")}</h2>
          <div className="flex flex-col gap-2">
            {calendar.resources
              .filter((r) => r.assignments.length > 0)
              .map((r) => (
                <div key={`${r.resourceType}-${r.resourceId}`} className="card">
                  <div className="text-sm font-medium text-gray-900">
                    {r.resourceName} <span className="text-xs text-gray-400">({t(r.resourceType)})</span>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {r.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-xs text-gray-600">
                        <span>
                          {a.projectName}
                          {a.taskName && <span className="text-gray-400"> / {a.taskName}</span>} —{" "}
                          {new Date(a.startDate).toLocaleDateString()} – {new Date(a.endDate).toLocaleDateString()}
                          {a.note && <span className="text-gray-400"> · {a.note}</span>}
                        </span>
                        <button onClick={() => removeAssignment(a.id)} className="text-gray-400 hover:text-error-600">
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>

          <h2 className="mb-3 mt-10 text-sm font-semibold text-gray-700">{t("workloadHeatmap")}</h2>
          <p className="mb-3 text-xs text-gray-400">{t("workloadHeatmapHint")}</p>
          {!heatmap ? (
            <p className="text-sm text-gray-400">{tc("loading")}</p>
          ) : heatmap.length === 0 ? (
            <p className="text-sm text-gray-400">{t("noAssignments")}</p>
          ) : (
            <WorkloadHeatmap rows={heatmap} />
          )}
        </>
      )}
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
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white pr-3 text-left font-medium text-gray-500">{t("worker")}</th>
            {allDates.map((date) => (
              <th key={date} className="px-1 py-1 text-center font-normal text-gray-400">
                {new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "numeric" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workerId}>
              <td className="sticky left-0 bg-white pr-3 py-1 font-medium text-gray-700">{row.workerName}</td>
              {allDates.map((date) => {
                const cell = cellFor(row, date);
                const hours = cell?.hours ?? 0;
                const bg = !cell ? "bg-gray-50" : cell.overallocated ? "bg-error-500" : hours >= 8 ? "bg-brand-500" : hours > 0 ? "bg-brand-200" : "bg-gray-50";
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
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-2">
        {calendar.resources
          .filter((r) => r.assignments.length > 0)
          .map((r) => (
            <div key={`${r.resourceType}-${r.resourceId}`} className="flex items-center gap-3">
              <div className="w-36 flex-none truncate text-xs text-gray-600">{r.resourceName}</div>
              <div className="relative h-6 min-w-[420px] flex-1 rounded bg-gray-100">
                {r.assignments.map((a) => {
                  const left = pct(new Date(a.startDate).getTime());
                  const right = pct(new Date(a.endDate).getTime());
                  const conflicted = conflictedIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`absolute h-6 overflow-hidden whitespace-nowrap rounded px-1 text-[10px] leading-6 text-white ${
                        conflicted ? "bg-error-500 ring-2 ring-error-700" : "bg-brand-500"
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(right - left, 2)}%` }}
                      title={`${a.projectName}: ${new Date(a.startDate).toLocaleDateString()} – ${new Date(a.endDate).toLocaleDateString()}`}
                    >
                      {a.projectName}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
