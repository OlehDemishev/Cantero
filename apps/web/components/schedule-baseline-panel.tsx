"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface Baseline {
  id: string;
  name: string;
  createdByName: string;
  createdAt: string;
}
interface TaskSlippage {
  taskId: string;
  name: string;
  status: "planned" | "in_progress" | "done" | "removed";
  baselineStartDate: string | null;
  baselineDueDate: string | null;
  currentStartDate: string | null;
  currentDueDate: string | null;
  slippageDays: number | null;
}
interface CompareResult {
  baselineId: string;
  baselineName: string;
  createdAt: string;
  tasks: TaskSlippage[];
}

const fmt = (d: string | null) => (d ? formatDate(new Date(d)) : "—");

export function ScheduleBaselinePanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduleBaseline");
  const tc = useTranslations("common");

  const [baselines, setBaselines] = useState<Baseline[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<Record<string, CompareResult>>({});

  function load() {
    apiFetch<Baseline[]>(`/schedule-baselines?projectId=${projectId}`).then(setBaselines);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/schedule-baselines?projectId=${projectId}`, { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName("");
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    const result = await apiFetch<CompareResult>(`/schedule-baselines/${id}/compare`);
    setCompareResults((r) => ({ ...r, [id]: result }));
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t("title")}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary px-2.5 py-1 text-xs">
            {t("newBaseline")}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("hint")}</p>

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

      {!baselines ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{tc("loading")}</p>
      ) : baselines.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noBaselines")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {baselines.map((b) => {
            const expanded = expandedId === b.id;
            const result = compareResults[b.id];
            return (
              <li key={b.id} className="card">
                <button onClick={() => toggleExpand(b.id)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{b.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t("createdBy", { name: b.createdByName, date: fmt(b.createdAt) })}</span>
                </button>

                {expanded && !result && <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>}

                {expanded && result && (
                  <div className="mt-3 overflow-x-auto border-t border-gray-100 dark:border-gray-700 pt-3">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400">
                          <th className="py-1">{tc("name")}</th>
                          <th>{t("baselineDates")}</th>
                          <th>{t("currentDates")}</th>
                          <th className="text-right">{t("slippage")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.tasks.map((task) => (
                          <tr key={task.taskId} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="py-1.5">
                              {task.name}
                              {task.status === "removed" && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({t("taskRemoved")})</span>}
                            </td>
                            <td className="text-xs text-gray-500 dark:text-gray-400">
                              {fmt(task.baselineStartDate)} – {fmt(task.baselineDueDate)}
                            </td>
                            <td className="text-xs text-gray-500 dark:text-gray-400">
                              {fmt(task.currentStartDate)} – {fmt(task.currentDueDate)}
                            </td>
                            <td
                              className={`text-right text-xs font-medium tabular-nums ${
                                task.slippageDays === null
                                  ? "text-gray-400 dark:text-gray-500"
                                  : task.slippageDays > 0
                                    ? "text-error-600"
                                    : task.slippageDays < 0
                                      ? "text-success-700 dark:text-success-500"
                                      : "text-gray-500 dark:text-gray-400"
                              }`}
                            >
                              {task.slippageDays === null
                                ? "—"
                                : task.slippageDays === 0
                                  ? t("onSchedule")
                                  : t("slippageDays", { days: Math.abs(task.slippageDays), direction: task.slippageDays > 0 ? t("late") : t("early") })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
