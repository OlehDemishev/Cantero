import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateScheduleBaselineInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { calculateScheduleSlippage } from "./schedule-slippage";

@Injectable()
export class ScheduleBaselineService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, createdByName: string, projectId: string, input: CreateScheduleBaselineInput) {
    await this.assertProject(companyId, projectId);
    const tasks = await this.prisma.task.findMany({ where: { projectId }, select: { id: true, name: true, startDate: true, dueDate: true } });

    return this.prisma.scheduleBaseline.create({
      data: {
        companyId,
        projectId,
        name: input.name,
        createdByName,
        tasks: {
          create: tasks.map((task) => ({ taskId: task.id, name: task.name, startDate: task.startDate, dueDate: task.dueDate })),
        },
      },
      include: { tasks: true },
    });
  }

  async list(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.scheduleBaseline.findMany({
      where: { companyId, projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Compares a saved baseline's tasks against the project's tasks as they stand today — see schedule-slippage.ts. */
  async compare(companyId: string, id: string) {
    const baseline = await this.prisma.scheduleBaseline.findFirst({ where: { id, companyId }, include: { tasks: true } });
    if (!baseline) throw new NotFoundException("Schedule baseline not found");

    const currentTasks = await this.prisma.task.findMany({
      where: { projectId: baseline.projectId },
      select: { id: true, name: true, status: true, startDate: true, dueDate: true },
    });

    return {
      baselineId: baseline.id,
      baselineName: baseline.name,
      createdAt: baseline.createdAt,
      tasks: calculateScheduleSlippage(baseline.tasks, currentTasks),
    };
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
