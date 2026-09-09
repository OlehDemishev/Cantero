"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { resetStateInEffect } from "@/lib/effect-reset";

interface Worker {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
}
interface TaskOption {
  id: string;
  name: string;
}
interface CrewMember {
  worker: Worker;
}
interface Crew {
  id: string;
  name: string;
  members: CrewMember[];
}
interface AssignCrewConflict {
  assignmentId: string;
  projectName: string;
  startDate: string;
  endDate: string;
}

const EMPTY_ASSIGN_FORM = { crewId: "", projectId: "", taskId: "", startDate: "", endDate: "", note: "" };

export function CrewsPanel({ workers, projects }: { workers: Worker[]; projects: Project[] }) {
  const t = useTranslations("resourcePlanning");
  const tc = useTranslations("common");

  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewWorkerIds, setNewCrewWorkerIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN_FORM);
  const [assignTasks, setAssignTasks] = useState<TaskOption[]>([]);
  const [assignConflicts, setAssignConflicts] = useState<AssignCrewConflict[] | null>(null);

  function load() {
    apiFetch<Crew[]>("/resource-planning/crews").then((list) => {
      setCrews(list);
      setAssignForm((f) => ({ ...f, crewId: f.crewId || (list[0]?.id ?? "") }));
    });
  }

  useEffect(load, []);

  useEffect(() => {
    if (!assignForm.projectId) {
      resetStateInEffect(() => setAssignTasks([]));
      return;
    }
    apiFetch<TaskOption[]>(`/tasks?projectId=${assignForm.projectId}`).then(setAssignTasks);
     
  }, [assignForm.projectId]);

  useEffect(() => {
    resetStateInEffect(() => setAssignForm((f) => ({ ...f, projectId: f.projectId || (projects[0]?.id ?? "") })));
  }, [projects]);

  function toggleNewCrewWorker(workerId: string) {
    setNewCrewWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  }

  async function createCrew(e: React.FormEvent) {
    e.preventDefault();
    if (!newCrewName.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/resource-planning/crews", {
        method: "POST",
        body: JSON.stringify({ name: newCrewName.trim(), workerIds: [...newCrewWorkerIds] }),
      });
      setNewCrewName("");
      setNewCrewWorkerIds(new Set());
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteCrew(id: string) {
    if (!window.confirm(t("confirmDeleteCrew"))) return;
    await apiFetch(`/resource-planning/crews/${id}`, { method: "DELETE" });
    load();
  }

  async function assignCrew(e: React.FormEvent) {
    e.preventDefault();
    if (!assignForm.crewId || !assignForm.projectId || !assignForm.startDate || !assignForm.endDate) return;
    setBusy(true);
    setAssignConflicts(null);
    try {
      const result = await apiFetch<{ assignments: { id: string }[]; conflicts: AssignCrewConflict[] }>("/resource-planning/crews/assign", {
        method: "POST",
        body: JSON.stringify({
          crewId: assignForm.crewId,
          projectId: assignForm.projectId,
          taskId: assignForm.taskId || undefined,
          startDate: new Date(assignForm.startDate).toISOString(),
          endDate: new Date(assignForm.endDate).toISOString(),
          note: assignForm.note || undefined,
        }),
      });
      if (result.conflicts.length > 0) setAssignConflicts(result.conflicts);
      setAssignForm((f) => ({ ...f, startDate: "", endDate: "", note: "" }));
    } finally {
      setBusy(false);
    }
  }

  if (crews === null) return null;

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("crews")}</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-secondary px-3 py-1 text-xs">
            {t("newCrew")}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createCrew} className="card mb-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">{tc("name")}</span>
            <input required className="input" value={newCrewName} onChange={(e) => setNewCrewName(e.target.value)} />
          </label>
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("members")}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {workers.map((w) => (
                <label key={w.id} className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs">
                  <input type="checkbox" checked={newCrewWorkerIds.has(w.id)} onChange={() => toggleNewCrewWorker(w.id)} />
                  {w.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {tc("save")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-secondary">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}

      {crews.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCrews")}</p>
      ) : (
        <>
          <ul className="mb-6 flex flex-col gap-2">
            {crews.map((crew) => (
              <li key={crew.id} className="card flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-50">{crew.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{crew.members.map((m) => m.worker.name).join(", ") || "—"}</div>
                </div>
                <button onClick={() => deleteCrew(crew.id)} className="text-xs text-error-600 hover:underline">
                  {tc("delete")}
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={assignCrew} className="card flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("assignCrew")}</h3>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("crews")}</span>
                <select className="input" value={assignForm.crewId} onChange={(e) => setAssignForm((f) => ({ ...f, crewId: e.target.value }))}>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("project")}</span>
                <select className="input" value={assignForm.projectId} onChange={(e) => setAssignForm((f) => ({ ...f, projectId: e.target.value, taskId: "" }))}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {assignTasks.length > 0 && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{t("task")}</span>
                  <select className="input" value={assignForm.taskId} onChange={(e) => setAssignForm((f) => ({ ...f, taskId: e.target.value }))}>
                    <option value="">—</option>
                    {assignTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("startDate")}</span>
                <input required type="date" className="input" value={assignForm.startDate} onChange={(e) => setAssignForm((f) => ({ ...f, startDate: e.target.value }))} />
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{t("endDate")}</span>
                <input required type="date" className="input" value={assignForm.endDate} onChange={(e) => setAssignForm((f) => ({ ...f, endDate: e.target.value }))} />
              </label>
            </div>
            <button type="submit" disabled={busy} className="btn-primary">
              {t("assignCrew")}
            </button>
            {assignConflicts && assignConflicts.length > 0 && (
              <p className="text-xs text-warning-700 dark:text-warning-500">
                {t("conflictsDetected", { count: assignConflicts.length })}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
