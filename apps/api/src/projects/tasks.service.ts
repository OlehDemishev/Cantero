import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTaskDependencyInput, CreateTaskInput, UpdateTaskInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { computeCriticalPath, minSuccessorStart, type DependencyForCpm, type TaskForCpm } from "./critical-path";

const INCLUDE_DEPENDENCIES = {
  estimateLine: { include: { rateCatalogItem: true } },
  predecessorLinks: { include: { predecessor: { select: { id: true, name: true } } } },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOK_AHEAD_WEEKS = 3;

const LOOK_AHEAD_INCLUDE = {
  predecessorLinks: { include: { predecessor: { select: { id: true, name: true, status: true } } } },
} as const;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.task.findMany({
      where: { projectId },
      include: INCLUDE_DEPENDENCIES,
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
    });
  }

  async create(companyId: string, input: CreateTaskInput) {
    await this.assertProject(companyId, input.projectId);

    if (input.estimateLineId) {
      const line = await this.prisma.estimateLine.findFirst({
        where: { id: input.estimateLineId, estimate: { projectId: input.projectId, companyId } },
      });
      if (!line) throw new BadRequestException("Estimate line does not belong to this project");
    }

    const maxSort = await this.prisma.task.aggregate({
      where: { projectId: input.projectId },
      _max: { sortOrder: true },
    });

    return this.prisma.task.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        estimateLineId: input.estimateLineId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        isOutdoorWork: input.isOutdoorWork,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: INCLUDE_DEPENDENCIES,
    });
  }

  async update(companyId: string, taskId: string, input: UpdateTaskInput) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { companyId } },
    });
    if (!task) throw new NotFoundException("Task not found");

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        sortOrder: input.sortOrder,
        isOutdoorWork: input.isOutdoorWork,
      },
      include: INCLUDE_DEPENDENCIES,
    });

    if (input.startDate || input.dueDate) await this.cascadeShift(taskId);
    return updated;
  }

  /** All dependency edges among a project's tasks, restricted to those with both dates set, run through the CPM calculator. */
  async getCriticalPath(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);

    const tasks = await this.prisma.task.findMany({ where: { projectId, startDate: { not: null }, dueDate: { not: null } } });
    const taskIds = tasks.map((t) => t.id);
    const dependencies = await this.prisma.taskDependency.findMany({
      where: { predecessorId: { in: taskIds }, successorId: { in: taskIds } },
    });

    const forCpm: TaskForCpm[] = tasks.map((t) => ({ id: t.id, startDate: t.startDate!, dueDate: t.dueDate! }));
    const depsForCpm: DependencyForCpm[] = dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type,
      lagDays: d.lagDays,
    }));
    return computeCriticalPath(forCpm, depsForCpm);
  }

  /**
   * A read-only, per-project critical-path pass across several projects at once, for a portfolio
   * schedule view. Each project's tasks/dependencies are fed through the CPM calculator
   * separately — "critical path" is inherently a per-project concept, so this is a loop of
   * independent single-project computations, not a merged cross-project graph. Silently skips
   * any id in `projectIds` that isn't a real project of this company, same as findMany would.
   */
  async portfolioSchedule(companyId: string, projectIds: string[]) {
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, companyId },
      select: { id: true, name: true },
    });

    return Promise.all(
      projects.map(async (project) => {
        const [tasks, milestones] = await Promise.all([
          this.prisma.task.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }] }),
          this.prisma.milestone.findMany({ where: { projectId: project.id } }),
        ]);

        const scheduled = tasks.filter((t) => t.startDate && t.dueDate);
        const scheduledIds = scheduled.map((t) => t.id);
        const dependencies =
          scheduledIds.length > 0
            ? await this.prisma.taskDependency.findMany({
                where: { predecessorId: { in: scheduledIds }, successorId: { in: scheduledIds } },
              })
            : [];

        const cpm = computeCriticalPath(
          scheduled.map((t) => ({ id: t.id, startDate: t.startDate!, dueDate: t.dueDate! })),
          dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagDays: d.lagDays })),
        );
        const criticalIds = new Set(cpm.filter((c) => c.critical).map((c) => c.id));

        return {
          projectId: project.id,
          projectName: project.name,
          tasks: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            startDate: t.startDate,
            dueDate: t.dueDate,
            isCritical: criticalIds.has(t.id),
          })),
          milestones: milestones.map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate })),
        };
      }),
    );
  }

  /**
   * The weekly foreman/subcontractor coordination list — not-yet-done tasks starting within the
   * next `weeks` weeks, grouped by week, each flagged "ready" only if every finish-to-start
   * predecessor is already done. That readiness flag is the actual point of a look-ahead
   * schedule over a plain date-filtered Gantt view: catching a task whose site constraints
   * (a predecessor not finished) haven't cleared yet, before the crew shows up to find out.
   * An overdue-but-not-done task collapses into week 0 ("due now") rather than being dropped,
   * same convention as the cash-flow forecast's bucketing.
   */
  async getLookAhead(companyId: string, projectId: string, weeks = LOOK_AHEAD_WEEKS) {
    await this.assertProject(companyId, projectId);
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowEnd = new Date(windowStart.getTime() + weeks * 7 * DAY_MS);

    const tasks = await this.prisma.task.findMany({
      where: { projectId, status: { not: "done" }, startDate: { not: null, lt: windowEnd } },
      include: LOOK_AHEAD_INCLUDE,
      orderBy: [{ startDate: "asc" }],
    });

    return tasks.map((task) => {
      // Only finish_to_start blocks readiness — a start_to_start/finish_to_finish/start_to_finish
      // predecessor constrains timing (already reflected in the Gantt/CPM view), not "can the crew
      // start at all", which is what this flag is actually answering.
      const blockedBy = task.predecessorLinks.filter((link) => link.type === "finish_to_start" && link.predecessor.status !== "done");
      const weekIndex = Math.max(0, Math.min(weeks - 1, Math.floor((task.startDate!.getTime() - windowStart.getTime()) / (7 * DAY_MS))));
      return {
        id: task.id,
        name: task.name,
        status: task.status,
        startDate: task.startDate,
        dueDate: task.dueDate,
        isOutdoorWork: task.isOutdoorWork,
        weekIndex,
        ready: blockedBy.length === 0,
        blockedByTaskNames: blockedBy.map((link) => link.predecessor.name),
      };
    });
  }

  async addDependency(companyId: string, successorId: string, input: CreateTaskDependencyInput) {
    const successor = await this.prisma.task.findFirst({ where: { id: successorId, project: { companyId } } });
    if (!successor) throw new NotFoundException("Task not found");
    if (input.predecessorId === successorId) throw new BadRequestException("A task cannot depend on itself");

    const predecessor = await this.prisma.task.findFirst({ where: { id: input.predecessorId, projectId: successor.projectId } });
    if (!predecessor) throw new BadRequestException("Predecessor task does not belong to the same project");

    if (await this.wouldCreateCycle(input.predecessorId, successorId)) {
      throw new BadRequestException("This dependency would create a circular chain");
    }

    const existing = await this.prisma.taskDependency.findUnique({
      where: { predecessorId_successorId: { predecessorId: input.predecessorId, successorId } },
    });
    if (existing) throw new BadRequestException("This dependency already exists");

    const dependency = await this.prisma.taskDependency.create({
      data: { predecessorId: input.predecessorId, successorId, type: input.type, lagDays: input.lagDays },
    });

    await this.cascadeShift(input.predecessorId);
    return dependency;
  }

  async removeDependency(companyId: string, dependencyId: string) {
    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, successor: { project: { companyId } } },
    });
    if (!dependency) throw new NotFoundException("Dependency not found");
    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
  }

  /**
   * Forward-only cascade: when a task's dates move, any successor whose dependency constraint is
   * now violated gets pushed out by the same delta (its own duration is preserved), then the
   * cascade continues into that successor's own successors. Never pulls a successor earlier —
   * this models "delays ripple forward," not full re-optimization.
   */
  private async cascadeShift(taskId: string, visited = new Set<string>()): Promise<void> {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.startDate || !task.dueDate) return;

    const edges = await this.prisma.taskDependency.findMany({ where: { predecessorId: taskId }, include: { successor: true } });
    for (const edge of edges) {
      const succ = edge.successor;
      if (!succ.startDate || !succ.dueDate) continue;

      const requiredStart = minSuccessorStart(
        { id: task.id, startDate: task.startDate, dueDate: task.dueDate },
        { id: succ.id, startDate: succ.startDate, dueDate: succ.dueDate },
        edge.type,
        edge.lagDays,
      );
      if (requiredStart > succ.startDate) {
        const deltaMs = requiredStart.getTime() - succ.startDate.getTime();
        const newDueDate = new Date(succ.dueDate.getTime() + deltaMs);
        await this.prisma.task.update({ where: { id: succ.id }, data: { startDate: requiredStart, dueDate: newDueDate } });
        await this.cascadeShift(succ.id, visited);
      }
    }
  }

  /** BFS forward from the would-be successor: if the would-be predecessor is reachable, the new edge would close a loop. */
  private async wouldCreateCycle(predecessorId: string, successorId: string): Promise<boolean> {
    const queue = [successorId];
    const seen = new Set<string>([successorId]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current === predecessorId) return true;
      const edges = await this.prisma.taskDependency.findMany({ where: { predecessorId: current }, select: { successorId: true } });
      for (const e of edges) {
        if (!seen.has(e.successorId)) {
          seen.add(e.successorId);
          queue.push(e.successorId);
        }
      }
    }
    return false;
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
