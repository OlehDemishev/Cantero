"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface ChecklistTask {
  id: string;
  title: string;
  done: boolean;
}

/** Onboarding and offboarding checklists — same shape, same toggle action, different endpoints. */
export function WorkerChecklistsPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const [onboardingTasks, setOnboardingTasks] = useState<ChecklistTask[] | null>(null);
  const [offboardingTasks, setOffboardingTasks] = useState<ChecklistTask[] | null>(null);

  useEffect(() => {
    apiFetch<ChecklistTask[]>(`/workers/${workerId}/onboarding-tasks`).then(setOnboardingTasks);
    apiFetch<ChecklistTask[]>(`/workers/${workerId}/offboarding-tasks`).then(setOffboardingTasks);
  }, [workerId]);

  async function toggleOnboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/onboarding-tasks/${taskId}/toggle`, { method: "POST" });
    apiFetch<ChecklistTask[]>(`/workers/${workerId}/onboarding-tasks`).then(setOnboardingTasks);
  }

  async function toggleOffboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/offboarding-tasks/${taskId}/toggle`, { method: "POST" });
    apiFetch<ChecklistTask[]>(`/workers/${workerId}/offboarding-tasks`).then(setOffboardingTasks);
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("onboardingChecklist")}</h2>
      {onboardingTasks === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : onboardingTasks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noOnboardingTasks")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {onboardingTasks.map((task) => (
            <li key={task.id} className="card flex items-center gap-2 text-sm">
              <input type="checkbox" checked={task.done} onChange={() => toggleOnboardingTask(task.id)} />
              <span className={task.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-50"}>{task.title}</span>
            </li>
          ))}
        </ul>
      )}

      {offboardingTasks !== null && offboardingTasks.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("offboardingChecklist")}</h2>
          <ul className="flex flex-col gap-1.5">
            {offboardingTasks.map((task) => (
              <li key={task.id} className="card flex items-center gap-2 text-sm">
                <input type="checkbox" checked={task.done} onChange={() => toggleOffboardingTask(task.id)} />
                <span className={task.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-50"}>{task.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
