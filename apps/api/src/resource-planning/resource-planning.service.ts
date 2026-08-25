import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateResourceAssignmentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

type ResourceType = "worker" | "equipment";

export interface ResourceConflict {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  assignmentAId: string;
  assignmentBId: string;
  projectAName: string;
  projectBName: string;
  overlapStart: string;
  overlapEnd: string;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();

@Injectable()
export class ResourcePlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every active worker and non-retired equipment item with its planned assignments, plus every
   * overlapping pair across the whole company — the calendar view and the conflicts list are
   * computed from the same data so they can never disagree with each other. */
  async calendar(companyId: string) {
    const [workers, equipment] = await Promise.all([
      this.prisma.worker.findMany({
        where: { companyId, active: true },
        include: {
          resourceAssignments: {
            include: { project: { select: { id: true, name: true } }, task: { select: { id: true, name: true } } },
            orderBy: { startDate: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.equipment.findMany({
        where: { companyId, status: { not: "retired" } },
        include: {
          resourceAssignments: {
            include: { project: { select: { id: true, name: true } }, task: { select: { id: true, name: true } } },
            orderBy: { startDate: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const resources = [
      ...workers.map((w) => ({
        resourceType: "worker" as const,
        resourceId: w.id,
        resourceName: w.name,
        subtitle: w.role,
        assignments: w.resourceAssignments,
      })),
      ...equipment.map((e) => ({
        resourceType: "equipment" as const,
        resourceId: e.id,
        resourceName: e.name,
        subtitle: e.category,
        assignments: e.resourceAssignments,
      })),
    ];

    const conflicts: ResourceConflict[] = [];
    for (const r of resources) {
      for (let i = 0; i < r.assignments.length; i++) {
        for (let j = i + 1; j < r.assignments.length; j++) {
          const a = r.assignments[i];
          const b = r.assignments[j];
          if (!overlaps(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
          const overlapStart = a.startDate > b.startDate ? a.startDate : b.startDate;
          const overlapEnd = a.endDate < b.endDate ? a.endDate : b.endDate;
          conflicts.push({
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            resourceName: r.resourceName,
            assignmentAId: a.id,
            assignmentBId: b.id,
            projectAName: a.project.name,
            projectBName: b.project.name,
            overlapStart: overlapStart.toISOString(),
            overlapEnd: overlapEnd.toISOString(),
          });
        }
      }
    }

    return {
      resources: resources.map((r) => ({
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        resourceName: r.resourceName,
        subtitle: r.subtitle,
        assignments: r.assignments.map((a) => ({
          id: a.id,
          projectId: a.project.id,
          projectName: a.project.name,
          taskId: a.task?.id ?? null,
          taskName: a.task?.name ?? null,
          startDate: a.startDate.toISOString(),
          endDate: a.endDate.toISOString(),
          note: a.note,
        })),
      })),
      conflicts,
    };
  }

  async create(companyId: string, actor: AuditActor, input: CreateResourceAssignmentInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    if (input.workerId) {
      const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
      if (!worker) throw new NotFoundException("Worker not found");
    }
    if (input.equipmentId) {
      const equipment = await this.prisma.equipment.findFirst({ where: { id: input.equipmentId, companyId } });
      if (!equipment) throw new NotFoundException("Equipment not found");
    }
    if (input.taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: input.taskId, projectId: input.projectId } });
      if (!task) throw new NotFoundException("Task not found on this project");
    }

    const assignment = await this.prisma.resourceAssignment.create({
      data: {
        companyId,
        projectId: input.projectId,
        taskId: input.taskId,
        workerId: input.workerId,
        equipmentId: input.equipmentId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        note: input.note,
      },
      include: { project: { select: { id: true, name: true } } },
    });

    this.audit.record(
      companyId,
      actor,
      "resource_assignment.created",
      "ResourceAssignment",
      assignment.id,
      `Assigned ${input.workerId ? "a worker" : "equipment"} to "${project.name}"`,
    );

    const conflicts = await this.findConflictsFor(companyId, assignment);

    return {
      assignment: {
        id: assignment.id,
        projectId: assignment.project.id,
        projectName: assignment.project.name,
        startDate: assignment.startDate.toISOString(),
        endDate: assignment.endDate.toISOString(),
        note: assignment.note,
      },
      conflicts,
    };
  }

  /** Assigned hours per worker per day over a date range — assumes 8h for each day an assignment
   * spans, so a day where a worker has two overlapping assignments totals >8h and is flagged
   * overallocated. This is a density view of ResourceAssignment, not actual logged TimeEntry hours. */
  async workloadHeatmap(companyId: string, from: Date, to: Date) {
    const HOURS_PER_DAY = 8;
    const assignments = await this.prisma.resourceAssignment.findMany({
      where: { companyId, workerId: { not: null }, startDate: { lte: to }, endDate: { gte: from } },
      include: { worker: { select: { id: true, name: true } } },
    });

    const byWorker = new Map<string, { workerId: string; workerName: string; days: Map<string, number> }>();
    for (const a of assignments) {
      if (!a.worker) continue;
      if (!byWorker.has(a.worker.id)) byWorker.set(a.worker.id, { workerId: a.worker.id, workerName: a.worker.name, days: new Map() });
      const entry = byWorker.get(a.worker.id)!;

      const start = a.startDate > from ? a.startDate : from;
      const end = a.endDate < to ? a.endDate : to;
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        entry.days.set(key, (entry.days.get(key) ?? 0) + HOURS_PER_DAY);
      }
    }

    return Array.from(byWorker.values()).map((entry) => ({
      workerId: entry.workerId,
      workerName: entry.workerName,
      days: Array.from(entry.days.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, hours]) => ({ date, hours, overallocated: hours > HOURS_PER_DAY })),
    }));
  }

  async delete(companyId: string, id: string) {
    const assignment = await this.prisma.resourceAssignment.findFirst({ where: { id, companyId } });
    if (!assignment) throw new NotFoundException("Assignment not found");
    await this.prisma.resourceAssignment.delete({ where: { id } });
    return { ok: true };
  }

  /** Overlap check scoped to just the one resource this assignment belongs to — used to give
   * immediate feedback right after creating an assignment, without waiting for the next calendar() load. */
  private async findConflictsFor(
    companyId: string,
    assignment: { id: string; workerId: string | null; equipmentId: string | null; startDate: Date; endDate: Date },
  ) {
    const where = assignment.workerId
      ? { companyId, workerId: assignment.workerId, id: { not: assignment.id } }
      : { companyId, equipmentId: assignment.equipmentId!, id: { not: assignment.id } };
    const others = await this.prisma.resourceAssignment.findMany({ where, include: { project: { select: { name: true } } } });
    return others
      .filter((o) => overlaps(assignment.startDate, assignment.endDate, o.startDate, o.endDate))
      .map((o) => ({
        assignmentId: o.id,
        projectName: o.project.name,
        startDate: o.startDate.toISOString(),
        endDate: o.endDate.toISOString(),
      }));
  }
}
