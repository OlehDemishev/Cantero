"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";

interface Task {
  id: string;
  name: string;
  startDate: string | null;
  dueDate: string | null;
}
interface ScenarioOverride {
  taskId: string;
  startDate: string;
  dueDate: string;
}
interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  overrides: ScenarioOverride[];
}
interface CompareResult {
  baselineProjectFinish: string | null;
  scenarioProjectFinish: string | null;
  finishDeltaDays: number | null;
}

export function ScheduleScenariosPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduleScenarios");
  const confirm = useConfirm();
  const tc = useTranslations("common");

  const { data: scenarios = null, reload: reloadScenarios, error: scenariosError } = useApi<Scenario[]>(`/projects/${projectId}/schedule-scenarios`);
  const { data: tasks = [] } = useApi<Task[]>(`/tasks?projectId=${projectId}`);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState({ taskId: "", startDate: "", dueDate: "" });
  const [compareResults, setCompareResults] = useState<Record<string, CompareResult>>({});

  function load() {
    void reloadScenarios();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/schedule-scenarios`, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName("");
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ message: t("confirmDeleteScenario"), tone: "danger", verb: "delete" }))) return;
    await apiFetch(`/schedule-scenarios/${id}`, { method: "DELETE" });
    load();
  }

  async function setOverride(scenarioId: string) {
    if (!overrideForm.taskId || !overrideForm.startDate || !overrideForm.dueDate) return;
    setBusy(true);
    try {
      await apiFetch(`/schedule-scenarios/${scenarioId}/overrides`, {
        method: "POST",
        body: JSON.stringify({
          taskId: overrideForm.taskId,
          startDate: new Date(overrideForm.startDate).toISOString(),
          dueDate: new Date(overrideForm.dueDate).toISOString(),
        }),
      });
      setOverrideForm({ taskId: "", startDate: "", dueDate: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function compare(scenarioId: string) {
    const result = await apiFetch<CompareResult>(`/schedule-scenarios/${scenarioId}/compare`);
    setCompareResults((r) => ({ ...r, [scenarioId]: result }));
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("newScenario")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("hint")}</p>

      {adding && (
        <form onSubmit={create} className="card mb-3 flex flex-wrap items-end gap-2">
          <input required placeholder={t("namePlaceholder")} className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={busy} className="btn-primary">
            {tc("save")}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            {tc("cancel")}
          </button>
        </form>
      )}

      {!scenarios ? (
        scenariosError ? <ErrorState error={scenariosError} onRetry={reloadScenarios} compact /> : <Skeleton lines={3} />
      ) : scenarios.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noScenarios")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {scenarios.map((s) => {
            const expanded = expandedId === s.id;
            const compareResult = compareResults[s.id];
            return (
              <li key={s.id} className="card">
                <button onClick={() => setExpandedId(expanded ? null : s.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-fg">{s.name}</span>
                  <span className="text-xs text-fg-subtle">{t("overridesCount", { count: s.overrides.length })}</span>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {s.overrides.length > 0 && (
                      <ul className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {s.overrides.map((o) => {
                          const task = tasks.find((tk) => tk.id === o.taskId);
                          return (
                            <li key={o.taskId}>
                              {task?.name ?? o.taskId}: {formatDate(new Date(o.startDate))} – {formatDate(new Date(o.dueDate))}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-end gap-2">
                      <select className="input" value={overrideForm.taskId} onChange={(e) => setOverrideForm((f) => ({ ...f, taskId: e.target.value }))}>
                        <option value="">{t("selectTask")}</option>
                        {tasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.name}
                          </option>
                        ))}
                      </select>
                      <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {t("startDate")}
                        <input type="date" className="input" value={overrideForm.startDate} onChange={(e) => setOverrideForm((f) => ({ ...f, startDate: e.target.value }))} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                        {t("dueDate")}
                        <input type="date" className="input" value={overrideForm.dueDate} onChange={(e) => setOverrideForm((f) => ({ ...f, dueDate: e.target.value }))} />
                      </label>
                      <button onClick={() => setOverride(s.id)} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("setOverride")}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => compare(s.id)} className="btn-secondary px-2.5 py-1 text-xs">
                        {t("compare")}
                      </button>
                      <button onClick={() => remove(s.id)} className="text-xs text-danger-fg hover:underline">
                        {tc("delete")}
                      </button>
                    </div>

                    {compareResult && (
                      <Alert tone={compareResult.finishDeltaDays === null ? "neutral" : compareResult.finishDeltaDays > 0 ? "danger" : compareResult.finishDeltaDays < 0 ? "success" : "neutral"} size="sm" role="status">
                        {compareResult.finishDeltaDays === null
                          ? t("noComparableTasks")
                          : compareResult.finishDeltaDays === 0
                            ? t("noFinishChange")
                            : t("finishDelta", { days: Math.abs(compareResult.finishDeltaDays), direction: compareResult.finishDeltaDays > 0 ? t("later") : t("earlier") })}
                      </Alert>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
