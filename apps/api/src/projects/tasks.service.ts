import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTaskInput, UpdateTaskInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.task.findMany({
      where: { projectId },
      include: { estimateLine: { include: { rateCatalogItem: true } } },
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
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: { estimateLine: { include: { rateCatalogItem: true } } },
    });
  }

  async update(companyId: string, taskId: string, input: UpdateTaskInput) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { companyId } },
    });
    if (!task) throw new NotFoundException("Task not found");

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        sortOrder: input.sortOrder,
      },
      include: { estimateLine: { include: { rateCatalogItem: true } } },
    });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
