import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateInspectionInput, RecordInspectionResultInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, permitId: string) {
    await this.assertPermit(companyId, permitId);
    return this.prisma.inspection.findMany({ where: { companyId, permitId }, orderBy: { scheduledDate: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, permitId: string, input: CreateInspectionInput) {
    const permit = await this.assertPermit(companyId, permitId);
    const inspection = await this.prisma.inspection.create({
      data: {
        companyId,
        permitId,
        inspectionType: input.inspectionType,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
        inspectorName: input.inspectorName,
        inspectorContact: input.inspectorContact,
        notes: input.notes,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "inspection.scheduled",
      "Inspection",
      inspection.id,
      `Scheduled ${input.inspectionType} inspection for permit ${permit.permitNumber ?? permit.permitType}`,
    );
    return inspection;
  }

  async recordResult(companyId: string, actor: AuditActor, id: string, input: RecordInspectionResultInput) {
    const inspection = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.inspection.update({
      where: { id: inspection.id },
      data: { result: input.result, notes: input.notes ?? inspection.notes, completedAt: input.result === "pending" ? null : new Date() },
    });
    this.audit.record(companyId, actor, "inspection.result_recorded", "Inspection", inspection.id, `Recorded ${input.result} for ${inspection.inspectionType} inspection`);
    return updated;
  }

  async delete(companyId: string, id: string) {
    const inspection = await this.findOrThrow(companyId, id);
    await this.prisma.inspection.delete({ where: { id: inspection.id } });
    return { ok: true };
  }

  private async assertPermit(companyId: string, permitId: string) {
    const permit = await this.prisma.permit.findFirst({ where: { id: permitId, companyId } });
    if (!permit) throw new NotFoundException("Permit not found");
    return permit;
  }

  private async findOrThrow(companyId: string, id: string) {
    const inspection = await this.prisma.inspection.findFirst({ where: { id, companyId } });
    if (!inspection) throw new NotFoundException("Inspection not found");
    return inspection;
  }
}
