import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSubcontractorInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SubcontractorsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.subcontractor.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  create(companyId: string, input: CreateSubcontractorInput) {
    return this.prisma.subcontractor.create({ data: { ...input, companyId } });
  }

  listAssignments(companyId: string, subcontractorId: string) {
    return this.prisma.subcontractorAssignment.findMany({
      where: { subcontractorId, subcontractor: { companyId } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async assign(companyId: string, subcontractorId: string, projectId: string) {
    const subcontractor = await this.prisma.subcontractor.findFirst({ where: { id: subcontractorId, companyId } });
    if (!subcontractor) throw new NotFoundException("Subcontractor not found");
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    return this.prisma.subcontractorAssignment.upsert({
      where: { subcontractorId_projectId: { subcontractorId, projectId } },
      create: { subcontractorId, projectId },
      update: {},
      include: { project: { select: { name: true } } },
    });
  }

  async unassign(companyId: string, subcontractorId: string, assignmentId: string) {
    const assignment = await this.prisma.subcontractorAssignment.findFirst({
      where: { id: assignmentId, subcontractorId, subcontractor: { companyId } },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    await this.prisma.subcontractorAssignment.delete({ where: { id: assignmentId } });
    return { ok: true };
  }
}
