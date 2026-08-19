import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTimeEntryInput, UpdateTimeEntryInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

export interface TimeEntryFilter {
  projectId?: string;
  workerId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, filter: TimeEntryFilter) {
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
      orderBy: { date: "desc" },
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

    return this.prisma.timeEntry.create({
      data: {
        companyId,
        workerId: input.workerId,
        projectId: input.projectId,
        taskId: input.taskId,
        hours: input.hours,
        date: new Date(input.date),
        hourlyCostSnapshot: worker.hourlyCost,
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
