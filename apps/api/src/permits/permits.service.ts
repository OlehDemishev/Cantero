import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePermitInput, UpdatePermitInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class PermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.permit.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } });
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  async create(companyId: string, actor: AuditActor, projectId: string, input: CreatePermitInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const permit = await this.prisma.permit.create({
      data: {
        companyId,
        projectId,
        permitType: input.permitType,
        permitNumber: input.permitNumber,
        authorityName: input.authorityName,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : undefined,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        notes: input.notes,
        status: input.submittedAt ? "submitted" : "draft",
      },
    });
    this.audit.record(companyId, actor, "permit.created", "Permit", permit.id, `Added ${input.permitType} permit for "${project.name}"`);
    return permit;
  }

  async update(companyId: string, id: string, input: UpdatePermitInput) {
    const permit = await this.findOrThrow(companyId, id);
    return this.prisma.permit.update({
      where: { id: permit.id },
      data: {
        permitType: input.permitType,
        permitNumber: input.permitNumber,
        authorityName: input.authorityName,
        status: input.status,
        submittedAt: input.submittedAt === null ? null : input.submittedAt ? new Date(input.submittedAt) : undefined,
        approvedAt: input.approvedAt === null ? null : input.approvedAt ? new Date(input.approvedAt) : undefined,
        expiresAt: input.expiresAt === null ? null : input.expiresAt ? new Date(input.expiresAt) : undefined,
        notes: input.notes,
        // A new expiry date means the old "expiring soon" notification no longer applies.
        expiringNotifiedAt: input.expiresAt !== undefined ? null : undefined,
      },
    });
  }

  async delete(companyId: string, id: string) {
    const permit = await this.findOrThrow(companyId, id);
    await this.prisma.permit.delete({ where: { id: permit.id } });
    return { ok: true };
  }

  private async findOrThrow(companyId: string, id: string) {
    const permit = await this.prisma.permit.findFirst({ where: { id, companyId } });
    if (!permit) throw new NotFoundException("Permit not found");
    return permit;
  }
}
