import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMilestoneInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.milestone.findMany({ where: { projectId }, orderBy: { dueDate: "asc" } });
  }

  async create(companyId: string, input: CreateMilestoneInput) {
    await this.assertProject(companyId, input.projectId);
    return this.prisma.milestone.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
