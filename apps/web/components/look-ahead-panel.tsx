"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";

type TaskStatus = "planned" | "in_progress" | "done";
type CommitmentStatus = "committed" | "completed" | "missed";

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
interface Commitment {
  id: string;
  status: CommitmentStatus;
  weekStarting: string;
  varianceReason: string | null;
  task: { id: string; name: string };
}
interface PpcReport {
  ppcPercent: number | null;
  completedCount: number;
  missedCount: number;
}

const WEEK_COUNT = 3;

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff)).toISOString();
}

/** The weekly foreman/subcontractor coordination list — not-yet-done tasks starting in the next
 * three weeks, grouped by week, each flagged "ready" only if its finish-to-start predecessors are
 * already done. That's the point of a look-ahead over the Gantt view: catching a task whose site
 * constraints haven't cleared before the crew shows up expecting to start. Committing a task to
 * its week and later resolving it completed/missed is the lean-construction "pull planning" loop
 * that PPC (percent plan complete) is measured against. */
export function LookAheadPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("scheduling");
  const tc = useTranslations("common");
  const { data: tasks = null, reload: reloadTasks } = useApi<LookAheadTask[]>(`/tasks/look-ahead?projectId=${projectId}`);
  const { data: commitments = [], reload: reloadCommitments } = useApi<Commitment[]>(`/tasks/commitments?projectId=${projectId}`);
  const { data: ppc = null, reload: reloadPpc } = useApi<PpcReport>(`/tasks/ppc-report?projectId=${projectId}`);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [varianceReason, setVarianceReason] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    void reloadTasks();
    void reloadCommitments();
    void reloadPpc();
  }

  if (tasks && tasks.length === 0) return null;

  function latestCommitment(taskId: string): Commitment | undefined {
    return commitments
      .filter((c) => c.task.id === taskId)
      .sort((a, b) => b.weekStarting.localeCompare(a.weekStarting))[0];
  }

  async function commit(task: LookAheadTask) {
    if (!task.startDate) return;
    setBusy(true);
    try {
      await apiFetch(`/tasks/${task.id}/commitments`, { method: "POST", body: JSON.stringify({ weekStarting: mondayOf(task.startDate) }) });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(commitmentId: string, status: "completed" | "missed") {
    if (status === "missed" && !varianceReason) return;
    setBusy(true);
    try {
      await apiFetch(`/tasks/commitments/${commitmentId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, varianceReason: status === "missed" ? varianceReason : undefined }),
      });
      setResolvingId(null);
      setVarianceReason("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">{t("lookAhead")}</h2>
        {ppc && ppc.ppcPercent !== null && (
          <Badge tone="neutral">{t("ppc", { percent: ppc.ppcPercent })}</Badge>
        )}
      </div>
      <p className="mb-3 text-xs text-fg-subtle">{t("lookAheadHint")}</p>

      {!tasks ? (
        <p className="text-sm text-fg-subtle">…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: WEEK_COUNT }, (_, weekIndex) => {
            const weekTasks = tasks.filter((task) => task.weekIndex === weekIndex);
            return (
              <div key={weekIndex} className="card">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("lookAheadWeek", { week: weekIndex + 1 })}
                </h3>
                {weekTasks.length === 0 ? (
                  <p className="text-xs text-fg-subtle">{t("lookAheadNoTasks")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {weekTasks.map((task) => {
                      const commitment = latestCommitment(task.id);
                      return (
                        <li key={task.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-2.5 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-fg">{task.name}</span>
                            <Badge tone={task.ready ? "success" : "warning"} className="shrink-0">
                              {task.ready ? t("lookAheadReady") : t("lookAheadBlocked")}
                            </Badge>
                          </div>
                          {task.startDate && (
                            <p className="mt-0.5 text-xs text-fg-subtle">
                              {formatDate(new Date(task.startDate))}
                              {task.dueDate && ` – ${formatDate(new Date(task.dueDate))}`}
                            </p>
                          )}
                          {!task.ready && task.blockedByTaskNames.length > 0 && (
                            <p className="mt-1 text-xs text-warning-fg">
                              {t("lookAheadBlockedBy", { names: task.blockedByTaskNames.join(", ") })}
                            </p>
                          )}

                          {!commitment && task.startDate && (
                            <button onClick={() => commit(task)} disabled={busy} className="btn-secondary mt-2 px-2 py-0.5 text-xs">
                              {t("commitTask")}
                            </button>
                          )}
                          {commitment && commitment.status === "committed" && resolvingId !== commitment.id && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Badge tone="brand">{t("committed")}</Badge>
                              <button onClick={() => resolve(commitment.id, "completed")} disabled={busy} className="btn-secondary px-2 py-0.5 text-xs">
                                {t("markCompleted")}
                              </button>
                              <button onClick={() => setResolvingId(commitment.id)} className="btn-secondary px-2 py-0.5 text-xs">
                                {t("markMissed")}
                              </button>
                            </div>
                          )}
                          {commitment && resolvingId === commitment.id && (
                            <div className="mt-2 flex items-end gap-1.5">
                              <input
                                required
                                placeholder={t("varianceReasonPlaceholder")}
                                className="input py-1 text-xs"
                                value={varianceReason}
                                onChange={(e) => setVarianceReason(e.target.value)}
                              />
                              <button onClick={() => resolve(commitment.id, "missed")} disabled={busy || !varianceReason} className="btn-primary px-2 py-0.5 text-xs">
                                {tc("save")}
                              </button>
                              <button onClick={() => setResolvingId(null)} className="btn-secondary px-2 py-0.5 text-xs">
                                {tc("cancel")}
                              </button>
                            </div>
                          )}
                          {commitment && commitment.status === "completed" && (
                            <Badge tone="success" className="mt-2">
                              {t("completed")}
                            </Badge>
                          )}
                          {commitment && commitment.status === "missed" && (
                            <p className="mt-2 text-xs text-danger-fg">{t("missedWithReason", { reason: commitment.varianceReason ?? "" })}</p>
                          )}
                        </li>
                      );
                    })}
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
