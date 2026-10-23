"use client";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/use-api";

interface ChecklistTask {
  id: string;
  title: string;
  done: boolean;
}

/** Onboarding and offboarding checklists — same shape, same toggle action, different endpoints. */
export function WorkerChecklistsPanel({ workerId }: { workerId: string }) {
  const t = useTranslations("team");
  const {
    data: onboardingTasks = null,
    error: onboardingTasksError,
    reload: reloadOnboardingTasks,
  } = useApi<ChecklistTask[]>(`/workers/${workerId}/onboarding-tasks`);
  const { data: offboardingTasks = null, reload: reloadOffboardingTasks } = useApi<ChecklistTask[]>(`/workers/${workerId}/offboarding-tasks`);

  async function toggleOnboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/onboarding-tasks/${taskId}/toggle`, { method: "POST" });
    void reloadOnboardingTasks();
  }

  async function toggleOffboardingTask(taskId: string) {
    await apiFetch(`/workers/${workerId}/offboarding-tasks/${taskId}/toggle`, { method: "POST" });
    void reloadOffboardingTasks();
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("onboardingChecklist")}</h2>
      {onboardingTasks === null ? (
        onboardingTasksError ? <ErrorState error={onboardingTasksError} onRetry={reloadOnboardingTasks} compact /> : <Skeleton lines={3} />
      ) : onboardingTasks.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("noOnboardingTasks")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {onboardingTasks.map((task) => (
            <li key={task.id} className="card text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={task.done} onChange={() => toggleOnboardingTask(task.id)} />
                <span className={task.done ? "text-fg-subtle line-through" : "text-fg"}>{task.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {offboardingTasks !== null && offboardingTasks.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">{t("offboardingChecklist")}</h2>
          <ul className="flex flex-col gap-1.5">
            {offboardingTasks.map((task) => (
              <li key={task.id} className="card text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={task.done} onChange={() => toggleOffboardingTask(task.id)} />
                  <span className={task.done ? "text-fg-subtle line-through" : "text-fg"}>{task.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
