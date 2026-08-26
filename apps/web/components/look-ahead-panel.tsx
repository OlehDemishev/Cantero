"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

type TaskStatus = "planned" | "in_progress" | "done";

interface LookAheadTask {
  id: string;
  name: string;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  isOutdoorWork: boolean;
  weekIndex: number;
  ready: boolean;
  blockedByTaskNames: string[];
}

const WEEK_COUNT = 3;

/** The weekly foreman/subcontractor coordination list — not-yet-done tasks starting in the next
 * three weeks, grouped by week, each flagged "ready" only if its finish-to-start predecessors are
 * already done. That's the point of a look-ahead over the Gantt view: catching a task whose site
 * constraints haven't cleared before the crew shows up expecting to start. */
export function LookAheadPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduling");
  const [tasks, setTasks] = useState<LookAheadTask[] | null>(null);

  useEffect(() => {
    apiFetch<LookAheadTask[]>(`/tasks/look-ahead?projectId=${projectId}`).then(setTasks);
  }, [projectId]);

  if (tasks && tasks.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-700">{t("lookAhead")}</h2>
      <p className="mb-3 text-xs text-gray-500">{t("lookAheadHint")}</p>

      {!tasks ? (
        <p className="text-sm text-gray-400">…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: WEEK_COUNT }, (_, weekIndex) => {
            const weekTasks = tasks.filter((task) => task.weekIndex === weekIndex);
            return (
              <div key={weekIndex} className="card">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("lookAheadWeek", { week: weekIndex + 1 })}
                </h3>
                {weekTasks.length === 0 ? (
                  <p className="text-xs text-gray-400">{t("lookAheadNoTasks")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {weekTasks.map((task) => (
                      <li key={task.id} className="rounded-lg border border-gray-100 px-2.5 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-800 dark:text-white/90">{task.name}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              task.ready ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700"
                            }`}
                          >
                            {task.ready ? t("lookAheadReady") : t("lookAheadBlocked")}
                          </span>
                        </div>
                        {task.startDate && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            {new Date(task.startDate).toLocaleDateString()}
                            {task.dueDate && ` – ${new Date(task.dueDate).toLocaleDateString()}`}
                          </p>
                        )}
                        {!task.ready && task.blockedByTaskNames.length > 0 && (
                          <p className="mt-1 text-xs text-warning-700">
                            {t("lookAheadBlockedBy", { names: task.blockedByTaskNames.join(", ") })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
