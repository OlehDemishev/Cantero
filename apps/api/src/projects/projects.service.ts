import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProjectInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  create(companyId: string, input: CreateProjectInput) {
    return this.prisma.project.create({ data: { ...input, companyId } });
  }
}
