const DAY_MS = 24 * 60 * 60 * 1000;

export type TaskDependencyType = "finish_to_start" | "start_to_start" | "finish_to_finish" | "start_to_finish";

export interface TaskForCpm {
  id: string;
  startDate: Date;
  dueDate: Date;
}
export interface DependencyForCpm {
  predecessorId: string;
  successorId: string;
  type: TaskDependencyType;
  lagDays: number;
}
export interface CpmResult {
  id: string;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  slackDays: number;
  critical: boolean;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function duration(task: TaskForCpm): number {
  return Math.max(1, diffDays(task.startDate, task.dueDate));
}

/**
 * The predecessor's earliest-allowed contribution to the successor's start, in day-offsets on
 * whatever consistent scale the caller is using for `predEs`/`predEf`. `succDuration` is needed
 * for FF/SF because those constrain the successor's *finish*, translated back to a start.
 */
function minSuccessorStartOffset(predEs: number, predEf: number, type: TaskDependencyType, lagDays: number, succDuration: number): number {
  switch (type) {
    case "finish_to_start":
      return predEf + lagDays;
    case "start_to_start":
      return predEs + lagDays;
    case "finish_to_finish":
      return predEf + lagDays - succDuration;
    case "start_to_finish":
      return predEs + lagDays - succDuration;
  }
}

/** Mirror of the above for the backward pass: the successor's latest-allowed constraint on the predecessor's finish. */
function maxPredecessorFinishOffset(succLs: number, succLf: number, type: TaskDependencyType, lagDays: number, predDuration: number): number {
  switch (type) {
    case "finish_to_start":
      return succLs - lagDays;
    case "start_to_start":
      return succLs - lagDays + predDuration;
    case "finish_to_finish":
      return succLf - lagDays;
    case "start_to_finish":
      return succLf - lagDays + predDuration;
  }
}

/**
 * Given the predecessor's own (real) dates, the minimum date the successor's start must satisfy
 * for one dependency edge — used to auto-shift a successor's schedule when its predecessor moves.
 */
export function minSuccessorStart(predecessor: TaskForCpm, successor: TaskForCpm, type: TaskDependencyType, lagDays: number): Date {
  const offset = minSuccessorStartOffset(0, duration(predecessor), type, lagDays, duration(successor));
  return addDays(predecessor.startDate, offset);
}

/**
 * Slack/float over the *as-scheduled* plan: each task's early start/finish is simply its own
 * assigned dates (this tool's tasks already carry real dates, unlike a from-scratch network
 * diagram), and the backward pass propagates how late each task could finish without pushing a
 * downstream dependency or the overall project finish. A task with zero or negative slack is
 * critical — delaying it delays something else.
 */
export function computeCriticalPath(tasks: TaskForCpm[], dependencies: DependencyForCpm[]): CpmResult[] {
  if (tasks.length === 0) return [];

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const edges = dependencies.filter((d) => byId.has(d.predecessorId) && byId.has(d.successorId));

  const predecessorsOf = new Map<string, DependencyForCpm[]>();
  const successorsOf = new Map<string, DependencyForCpm[]>();
  for (const t of tasks) {
    predecessorsOf.set(t.id, []);
    successorsOf.set(t.id, []);
  }
  for (const e of edges) {
    predecessorsOf.get(e.successorId)!.push(e);
    successorsOf.get(e.predecessorId)!.push(e);
  }

  // Kahn's algorithm to get a forward topological order; any leftover nodes (a defensive
  // fallback for a cycle that shouldn't exist, since creation-time checks block them) are
  // appended in input order rather than dropped.
  const inDegree = new Map(tasks.map((t) => [t.id, predecessorsOf.get(t.id)!.length]));
  const queue = tasks.filter((t) => inDegree.get(t.id) === 0).map((t) => t.id);
  const topoOrder: string[] = [];
  const inQueue = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const e of successorsOf.get(id)!) {
      const next = inDegree.get(e.successorId)! - 1;
      inDegree.set(e.successorId, next);
      if (next === 0 && !inQueue.has(e.successorId)) {
        inQueue.add(e.successorId);
        queue.push(e.successorId);
      }
    }
  }
  for (const t of tasks) if (!topoOrder.includes(t.id)) topoOrder.push(t.id);

  const epoch = tasks.reduce((min, t) => (t.startDate < min ? t.startDate : min), tasks[0].startDate);
  const es = new Map(tasks.map((t) => [t.id, diffDays(epoch, t.startDate)]));
  const ef = new Map(tasks.map((t) => [t.id, diffDays(epoch, t.dueDate)]));

  const projectFinish = Math.max(...tasks.map((t) => ef.get(t.id)!));

  // Reversed forward-topo-order visits every task's successors before the task itself, which is
  // exactly what the backward pass needs.
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const task = byId.get(id)!;
    const succs = successorsOf.get(id)!;
    const finish =
      succs.length === 0
        ? projectFinish
        : Math.min(...succs.map((e) => maxPredecessorFinishOffset(ls.get(e.successorId)!, lf.get(e.successorId)!, e.type, e.lagDays, duration(task))));
    lf.set(id, finish);
    ls.set(id, finish - duration(task));
  }

  return tasks.map((t) => {
    const slack = ls.get(t.id)! - es.get(t.id)!;
    return {
      id: t.id,
      earlyStart: addDays(epoch, es.get(t.id)!),
      earlyFinish: addDays(epoch, ef.get(t.id)!),
      lateStart: addDays(epoch, ls.get(t.id)!),
      lateFinish: addDays(epoch, lf.get(t.id)!),
      slackDays: slack,
      critical: slack <= 0,
    };
  });
}
