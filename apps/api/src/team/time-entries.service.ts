import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTimeEntryInput, UpdateTimeEntryInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { checkGeofence } from "./geofence";

export interface TimeEntryFilter {
  projectId?: string;
  workerId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** `pagination.cursor` (internal controller, id-based) and `pagination.skip` (public API,
   * offset-based — see PublicApiService.timeEntries()) are mutually exclusive ways to page
   * through the same deterministic [date desc, id desc] order; omit both for "everything",
   * unchanged from before pagination existed. */
  list(companyId: string, filter: TimeEntryFilter, pagination?: { take?: number; skip?: number; cursor?: string }) {
    return this.prisma.timeEntry.findMany({
      where: {
        companyId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.workerId ? { workerId: filter.workerId } : {}),
        ...(filter.from || filter.to
          ? {
              date: {
                ...(filter.from ? { gte: new Date(filter.from) } : {}),
                ...(filter.to ? { lte: new Date(filter.to) } : {}),
              },
            }
          : {}),
      },
      include: { worker: true, task: true, project: true },
      // date is user-entered (a shift's calendar date), not a generated timestamp — an id
      // tiebreaker keeps the sort (and cursor pagination) deterministic across same-day entries.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...(pagination?.take !== undefined ? { take: pagination.take } : {}),
      ...(pagination?.cursor
        ? { skip: 1, cursor: { id: pagination.cursor } }
        : pagination?.skip !== undefined
          ? { skip: pagination.skip }
          : {}),
    });
  }

  async create(companyId: string, input: CreateTimeEntryInput) {
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");

    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: input.taskId, projectId: input.projectId } });
      if (!task) throw new BadRequestException("Task does not belong to this project");
    }

    let distanceFromSiteMeters: number | undefined;
    let withinGeofence: boolean | undefined;
    if (input.clockInLat !== undefined && input.clockInLng !== undefined && project.geofenceLat !== null && project.geofenceLng !== null && project.geofenceRadiusMeters !== null) {
      const check = checkGeofence(input.clockInLat, input.clockInLng, project.geofenceLat, project.geofenceLng, project.geofenceRadiusMeters);
      distanceFromSiteMeters = check.distanceMeters;
      withinGeofence = check.withinGeofence;
    }

    return this.prisma.timeEntry.create({
      data: {
        companyId,
        workerId: input.workerId,
        projectId: input.projectId,
        taskId: input.taskId,
        hours: input.hours,
        date: new Date(input.date),
        hourlyCostSnapshot: worker.hourlyCost,
        clockInLat: input.clockInLat,
        clockInLng: input.clockInLng,
        distanceFromSiteMeters,
        withinGeofence,
      },
      include: { worker: true, task: true },
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, companyId } });
    if (!entry) throw new NotFoundException("Time entry not found");
    return entry;
  }

  async update(companyId: string, id: string, input: UpdateTimeEntryInput) {
    const entry = await this.findOrThrow(companyId, id);
    if (input.taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: input.taskId, projectId: entry.projectId } });
      if (!task) throw new BadRequestException("Task does not belong to this project");
    }
    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(input.hours !== undefined ? { hours: input.hours } : {}),
        ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      },
      include: { worker: true, task: true },
    });
  }

  async delete(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    await this.prisma.timeEntry.delete({ where: { id } });
    return { ok: true };
  }
}
