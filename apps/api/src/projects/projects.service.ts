import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProjectInput, UpdateProjectWarrantyInput } from "@cantero/shared";
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

  async create(companyId: string, input: CreateProjectInput) {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: input.clientId, companyId } });
      if (!client) throw new NotFoundException("Client not found");
    }
    return this.prisma.project.create({ data: { ...input, companyId } });
  }

  async updateWarranty(companyId: string, id: string, input: UpdateProjectWarrantyInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        handoverDate: input.handoverDate === null ? null : input.handoverDate ? new Date(input.handoverDate) : undefined,
        warrantyMonths: input.warrantyMonths,
      },
      include: { client: true },
    });
  }
}
