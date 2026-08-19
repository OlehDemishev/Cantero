import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSubcontractorCostInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SubcontractorCostsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.subcontractorCost.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { subcontractor: true },
      orderBy: { incurredDate: "desc" },
    });
  }

  async create(companyId: string, input: CreateSubcontractorCostInput) {
    const subcontractor = await this.prisma.subcontractor.findFirst({
      where: { id: input.subcontractorId, companyId },
    });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    return this.prisma.subcontractorCost.create({
      data: {
        companyId,
        subcontractorId: input.subcontractorId,
        projectId: input.projectId,
        description: input.description,
        amount: input.amount,
        incurredDate: input.incurredDate ? new Date(input.incurredDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: { subcontractor: true },
    });
  }

  async markPaid(companyId: string, id: string) {
    const cost = await this.prisma.subcontractorCost.findFirst({ where: { id, companyId } });
    if (!cost) throw new NotFoundException("Subcontractor cost not found");
    return this.prisma.subcontractorCost.update({
      where: { id },
      data: { paid: true },
      include: { subcontractor: true },
    });
  }
}
