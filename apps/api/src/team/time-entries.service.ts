import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTimeEntryInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.timeEntry.findMany({
      where: { companyId, projectId },
      include: { worker: true, task: true },
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
      },
      include: { worker: true, task: true },
    });
  }
}
