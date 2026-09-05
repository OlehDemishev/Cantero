export interface BaselineTaskForSlippage {
  taskId: string;
  name: string;
  startDate: Date | null;
  dueDate: Date | null;
}

export interface CurrentTaskForSlippage {
  id: string;
  name: string;
  status: "planned" | "in_progress" | "done";
  startDate: Date | null;
  dueDate: Date | null;
}

export interface TaskSlippage {
  taskId: string;
  name: string;
  status: "planned" | "in_progress" | "done" | "removed";
  baselineStartDate: Date | null;
  baselineDueDate: Date | null;
  currentStartDate: Date | null;
  currentDueDate: Date | null;
  /** Current due date minus baseline due date, in whole days. Positive = late, negative = ahead. Null when either date is missing. */
  slippageDays: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compares a saved schedule baseline against the project's current tasks, one row per baseline
 * task. A baseline task whose id no longer matches a current task is reported as "removed" with
 * null current dates rather than dropped, so a deleted/renamed task still shows up as a gap in
 * the comparison instead of silently vanishing.
 */
export function calculateScheduleSlippage(baselineTasks: BaselineTaskForSlippage[], currentTasks: CurrentTaskForSlippage[]): TaskSlippage[] {
  const currentById = new Map(currentTasks.map((t) => [t.id, t]));

  return baselineTasks.map((baseline) => {
    const current = currentById.get(baseline.taskId);
    const currentDueDate = current?.dueDate ?? null;
    const slippageDays =
      baseline.dueDate && currentDueDate ? Math.round((currentDueDate.getTime() - baseline.dueDate.getTime()) / DAY_MS) : null;

    return {
      taskId: baseline.taskId,
      name: current?.name ?? baseline.name,
      status: current?.status ?? "removed",
      baselineStartDate: baseline.startDate,
      baselineDueDate: baseline.dueDate,
      currentStartDate: current?.startDate ?? null,
      currentDueDate,
      slippageDays,
    };
  });
}
