"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";

interface PerformanceGoal {
  id: string;
  title: string;
  targetDate: string | null;
  progressPercent: number;
  completedAt: string | null;
}
interface PerformanceReview {
  id: string;
  rating: "below_expectations" | "meets_expectations" | "exceeds_expectations" | null;
  strengths: string | null;
  improvementAreas: string | null;
  submittedAt: string | null;
  cycle: { id: string; name: string };
}

export function WorkerPerformancePanel({ workerId }: { workerId: string }) {
  const tc = useTranslations("common");
  const tp = useTranslations("performance");
  const [performanceGoals, setPerformanceGoals] = useState<PerformanceGoal[] | null>(null);
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[] | null>(null);
  const [goalForm, setGoalForm] = useState({ title: "", targetDate: "" });
  const [goalBusy, setGoalBusy] = useState(false);

  function load() {
    apiFetch<PerformanceGoal[]>(`/performance/workers/${workerId}/goals`).then(setPerformanceGoals);
    apiFetch<PerformanceReview[]>(`/performance/workers/${workerId}/reviews`).then(setPerformanceReviews);
  }

  useEffect(load, [workerId]);

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalForm.title.trim()) return;
    setGoalBusy(true);
    try {
      await apiFetch(`/performance/workers/${workerId}/goals`, {
        method: "POST",
        body: JSON.stringify({
          title: goalForm.title.trim(),
          targetDate: goalForm.targetDate ? new Date(goalForm.targetDate).toISOString() : undefined,
        }),
      });
      setGoalForm({ title: "", targetDate: "" });
      load();
    } finally {
      setGoalBusy(false);
    }
  }

  async function updateGoalProgress(goalId: string, progressPercent: number) {
    setGoalBusy(true);
    try {
      await apiFetch(`/performance/goals/${goalId}/progress`, { method: "POST", body: JSON.stringify({ progressPercent }) });
      load();
    } finally {
      setGoalBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{tp("goals")}</h2>
      {performanceGoals === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : performanceGoals.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tp("noGoals")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {performanceGoals.map((goal) => (
            <li key={goal.id} className="card text-sm">
              <div className="flex items-center justify-between">
                <span className={goal.completedAt ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-900 dark:text-gray-50"}>{goal.title}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{goal.progressPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={goal.progressPercent}
                disabled={goalBusy}
                onChange={(e) => updateGoalProgress(goal.id, Number(e.target.value))}
                className="mt-1.5 w-full"
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addGoal} className="flex max-w-md flex-col gap-2">
        <input
          required
          placeholder={tp("goalTitlePlaceholder")}
          className="input"
          value={goalForm.title}
          onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            type="date"
            className="input"
            value={goalForm.targetDate}
            onChange={(e) => setGoalForm((f) => ({ ...f, targetDate: e.target.value }))}
          />
          <button type="submit" disabled={goalBusy} className="btn-secondary shrink-0">
            {tp("addGoal")}
          </button>
        </div>
      </form>

      {performanceReviews !== null && performanceReviews.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700 dark:text-gray-200">{tp("reviewHistory")}</h2>
          <ul className="flex flex-col gap-1.5">
            {performanceReviews.map((r) => (
              <li key={r.id} className="card text-sm">
                <div className="flex items-center justify-between">
                  <span>{r.cycle.name}</span>
                  {r.rating && <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{tp(`rating_${r.rating}`)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
