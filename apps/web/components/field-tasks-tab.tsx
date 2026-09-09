"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { submitOrQueue } from "@/lib/offline-queue";
import { fetchCached, updateCache } from "@/lib/offline-cache";
import { resetStateInEffect } from "@/lib/effect-reset";
import { CachedNote } from "@/components/field-cached-note";
import { FieldMessage } from "@/components/field-message";

type TaskStatus = "planned" | "in_progress" | "done";
const STATUS_ORDER: TaskStatus[] = ["planned", "in_progress", "done"];

interface Task {
  id: string;
  name: string;
  status: TaskStatus;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const ts = useTranslations("scheduling");
  const styles: Record<TaskStatus, string> = {
    planned: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
    in_progress: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-500",
    done: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>{ts(status)}</span>;
}

export function TasksTab({ projectId }: { projectId: string }) {
  const t = useTranslations("field");
  const tc = useTranslations("common");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const cacheKey = `field:tasks:${projectId}`;

  useEffect(() => {
    resetStateInEffect(() => {
      setTasks(null);
      setError(false);
      setCachedAt(null);
    });
    fetchCached<Task[]>(cacheKey, `/tasks?projectId=${projectId}`)
      .then(({ data, stale, cachedAt: at }) => {
        setTasks(data);
        setCachedAt(stale ? at : null);
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function advance(task: Task) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length];
    const previous = tasks ?? [];
    const updated = previous.map((x) => (x.id === task.id ? { ...x, status: next } : x));
    setTasks(updated);
    updateCache(cacheKey, updated).catch(() => {});
    setActionError(null);
    try {
      await submitOrQueue("task-status", `/tasks/${task.id}`, "PATCH", { status: next });
    } catch (err) {
      // The server rejected the change (not just offline, which submitOrQueue already queues) —
      // roll the optimistic update back so the UI doesn't permanently diverge from the backend.
      setTasks(previous);
      updateCache(cacheKey, previous).catch(() => {});
      setActionError(err instanceof Error ? err.message : tc("error"));
    }
  }

  if (error) return <p className="text-sm text-gray-400 dark:text-gray-500">{t("offline")}</p>;
  if (!tasks) return <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>;
  if (tasks.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500">{t("noTasks")}</p>;

  return (
    <div>
      <CachedNote cachedAt={cachedAt} />
      {actionError && (
        <div className="mb-2">
          <FieldMessage type="error" text={actionError} />
        </div>
      )}
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("tapToAdvance")}</p>
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button onClick={() => advance(task)} className="card flex w-full items-center justify-between text-left">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{task.name}</span>
              <StatusBadge status={task.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
