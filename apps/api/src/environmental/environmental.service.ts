import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddBmpInspectionInput,
  CreateStormwaterPermitInput,
  FileNoticeOfTerminationInput,
  ReportEnvironmentalIncidentInput,
  UpdateEnvironmentalIncidentStatusInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class EnvironmentalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPermitsForProject(companyId: string, projectId: string) {
    return this.prisma.stormwaterPermit.findMany({
      where: { companyId, projectId },
      include: { inspections: { orderBy: { inspectedAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPermit(companyId: string, actor: AuditActor, projectId: string, input: CreateStormwaterPermitInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const permit = await this.prisma.stormwaterPermit.create({
      data: { companyId, projectId, permitNumber: input.permitNumber, noiFiledAt: input.noiFiledAt ? new Date(input.noiFiledAt) : undefined },
    });
    this.audit.record(companyId, actor, "stormwater_permit.created", "StormwaterPermit", permit.id, `Filed stormwater permit for "${project.name}"`);
    return permit;
  }

  async fileNoticeOfTermination(companyId: string, actor: AuditActor, id: string, input: FileNoticeOfTerminationInput) {
    const permit = await this.findPermitOrThrow(companyId, id);
    if (!permit.active) throw new BadRequestException("This permit is already inactive");
    const updated = await this.prisma.stormwaterPermit.update({
      where: { id },
      data: { notFiledAt: new Date(input.notFiledAt), active: false },
    });
    this.audit.record(companyId, actor, "stormwater_permit.terminated", "StormwaterPermit", id, "Filed notice of termination");
    return updated;
  }

  async addBmpInspection(companyId: string, actor: AuditActor, permitId: string, input: AddBmpInspectionInput) {
    const permit = await this.findPermitOrThrow(companyId, permitId);
    const inspection = await this.prisma.bmpInspection.create({
      data: {
        companyId,
        permitId,
        triggerReason: input.triggerReason,
        result: input.result,
        inspectorName: input.inspectorName,
        correctiveActions: input.correctiveActions,
      },
    });
    this.audit.record(companyId, actor, "bmp_inspection.logged", "BmpInspection", inspection.id, `Logged a ${input.result} BMP inspection on permit ${permit.permitNumber ?? permit.id}`);
    return inspection;
  }

  listIncidentsForProject(companyId: string, projectId: string) {
    return this.prisma.environmentalIncident.findMany({ where: { companyId, projectId }, orderBy: { occurredAt: "desc" } });
  }

  async reportIncident(companyId: string, actor: AuditActor, projectId: string, input: ReportEnvironmentalIncidentInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const incident = await this.prisma.environmentalIncident.create({
      data: {
        companyId,
        projectId,
        description: input.description,
        severity: input.severity,
        regulatorNotified: input.regulatorNotified,
      },
    });
    this.audit.record(companyId, actor, "environmental_incident.reported", "EnvironmentalIncident", incident.id, `Reported an environmental incident on "${project.name}"`);
    return incident;
  }

  async updateIncidentStatus(companyId: string, actor: AuditActor, id: string, input: UpdateEnvironmentalIncidentStatusInput) {
    const incident = await this.prisma.environmentalIncident.findFirst({ where: { id, companyId } });
    if (!incident) throw new NotFoundException("Environmental incident not found");
    const updated = await this.prisma.environmentalIncident.update({
      where: { id },
      data: { status: input.status, containedAt: input.status === "contained" ? new Date() : undefined },
    });
    this.audit.record(companyId, actor, "environmental_incident.status_changed", "EnvironmentalIncident", id, `Changed incident status to ${input.status}`);
    return updated;
  }

  private async findPermitOrThrow(companyId: string, id: string) {
    const permit = await this.prisma.stormwaterPermit.findFirst({ where: { id, companyId } });
    if (!permit) throw new NotFoundException("Stormwater permit not found");
    return permit;
  }
}
