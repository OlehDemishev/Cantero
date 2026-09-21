import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import type { ExchangeSchedule } from "./schedule-exchange";
import { buildMspdi, parseMspdi } from "./mspdi";
import { buildXer, decodeXer, parseXer } from "./xer";

export type ScheduleFileFormat = "mspdi" | "xer";

export interface ScheduleImportSummary {
  format: ScheduleFileFormat;
  tasksCreated: number;
  milestonesCreated: number;
  dependenciesCreated: number;
  /** Links dropped because they touched a milestone (Cantero's dependencies are task-to-task),
   * repeated an already-imported pair, or pointed at themselves. */
  dependenciesSkipped: number;
}

/** True when the dependency graph has a cycle — a corrupt or hand-edited file could otherwise
 * plant one, and every scheduling feature (cascade shift, critical path) assumes a DAG. */
function hasCycle(uids: string[], edges: { predecessorUid: string; successorUid: string }[]): boolean {
  const incoming = new Map(uids.map((u) => [u, 0]));
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    incoming.set(e.successorUid, (incoming.get(e.successorUid) ?? 0) + 1);
    outgoing.set(e.predecessorUid, [...(outgoing.get(e.predecessorUid) ?? []), e.successorUid]);
  }
  const queue = uids.filter((u) => incoming.get(u) === 0);
  let visited = 0;
  while (queue.length) {
    const uid = queue.pop()!;
    visited++;
    for (const next of outgoing.get(uid) ?? []) {
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  return visited !== uids.length;
}

/**
 * Import/export of project schedules as files rather than a live connector: desktop MS Project's
 * MSPDI XML and Primavera P6's XER. Both are open, documented formats that need no partner
 * program or license, which is why they cover far more contractors than the Dataverse-based
 * MsProjectService (that one only reaches the retiring cloud Project for the Web).
 *
 * Import always appends — it never edits or deletes existing tasks — and writes dates exactly as
 * the file has them rather than going through TasksService.addDependency, whose cascadeShift
 * would move imported dates around to satisfy the links.
 */
@Injectable()
export class ScheduleFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async importFile(
    companyId: string,
    actor: AuditActor,
    projectId: string,
    file: { originalname: string; buffer: Buffer },
    role?: string,
  ): Promise<ScheduleImportSummary> {
    await this.assertProject(companyId, projectId);
    await this.projectAccess.assertAccess(companyId, projectId, actor.userId, role);

    const text = decodeXer(file.buffer).replace(/^\uFEFF/, "");
    const format: ScheduleFileFormat = text.startsWith("ERMHDR") ? "xer" : "mspdi";
    let schedule: ExchangeSchedule;
    try {
      schedule = format === "xer" ? parseXer(text) : parseMspdi(text);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Couldn't read this schedule file");
    }
    if (schedule.tasks.length === 0) throw new BadRequestException("The file contains no tasks to import");

    const taskUids = schedule.tasks.filter((t) => !t.isMilestone).map((t) => t.uid);
    const taskUidSet = new Set(taskUids);
    const seen = new Set<string>();
    const usableDeps = schedule.dependencies.filter((d) => {
      const key = `${d.predecessorUid}>${d.successorUid}`;
      const ok = d.predecessorUid !== d.successorUid && taskUidSet.has(d.predecessorUid) && taskUidSet.has(d.successorUid) && !seen.has(key);
      if (ok) seen.add(key);
      return ok;
    });
    if (hasCycle(taskUids, usableDeps)) throw new BadRequestException("The file's dependencies form a circular chain, so it can't be imported");

    const result = await this.prisma.$transaction(async (tx) => {
      const maxSort = await tx.task.aggregate({ where: { projectId }, _max: { sortOrder: true } });
      let sortOrder = maxSort._max.sortOrder ?? 0;

      const idByUid = new Map<string, string>();
      let milestones = 0;
      for (const item of schedule.tasks) {
        if (item.isMilestone) {
          await tx.milestone.create({ data: { projectId, name: item.name, dueDate: item.finishDate ?? item.startDate } });
          milestones++;
          continue;
        }
        const created = await tx.task.create({
          data: {
            companyId,
            projectId,
            name: item.name,
            status: item.status,
            startDate: item.startDate,
            dueDate: item.finishDate,
            sortOrder: ++sortOrder,
          },
        });
        idByUid.set(item.uid, created.id);
      }

      for (const dep of usableDeps) {
        await tx.taskDependency.create({
          data: { predecessorId: idByUid.get(dep.predecessorUid)!, successorId: idByUid.get(dep.successorUid)!, type: dep.type, lagDays: dep.lagDays },
        });
      }
      return { tasks: idByUid.size, milestones, dependencies: usableDeps.length };
    });

    this.audit.record(
      companyId,
      actor,
      "schedule.imported",
      "Project",
      projectId,
      `Imported ${result.tasks} task(s) and ${result.milestones} milestone(s) from ${file.originalname} (${format.toUpperCase()})`,
    );
    return {
      format,
      tasksCreated: result.tasks,
      milestonesCreated: result.milestones,
      dependenciesCreated: result.dependencies,
      dependenciesSkipped: schedule.dependencies.length - usableDeps.length,
    };
  }

  async exportFile(companyId: string, projectId: string, format: ScheduleFileFormat, userId?: string, role?: string) {
    const project = await this.assertProject(companyId, projectId);
    await this.projectAccess.assertAccess(companyId, projectId, userId, role);

    const [tasks, milestones] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId },
        include: { predecessorLinks: true },
        orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      }),
      this.prisma.milestone.findMany({ where: { projectId }, orderBy: { dueDate: "asc" } }),
    ]);

    const schedule: ExchangeSchedule = {
      name: project.name,
      tasks: [
        ...tasks.map((t) => ({ uid: t.id, name: t.name, startDate: t.startDate, finishDate: t.dueDate, status: t.status, isMilestone: false })),
        ...milestones.map((m) => ({ uid: `m-${m.id}`, name: m.name, startDate: m.dueDate, finishDate: m.dueDate, status: "planned" as const, isMilestone: true })),
      ],
      dependencies: tasks.flatMap((t) =>
        t.predecessorLinks.map((l) => ({ predecessorUid: l.predecessorId, successorUid: t.id, type: l.type, lagDays: l.lagDays })),
      ),
    };

    const safeName = project.name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "schedule";
    return format === "xer"
      ? { content: buildXer(schedule), filename: `${safeName}.xer`, contentType: "application/octet-stream" }
      : { content: buildMspdi(schedule), filename: `${safeName}.xml`, contentType: "application/xml; charset=utf-8" };
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
