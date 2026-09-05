import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AcknowledgeTransmittalInput, CreateTransmittalInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class TransmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listForProject(companyId: string, projectId: string) {
    return this.prisma.transmittal.findMany({
      where: { companyId, projectId },
      include: { items: true },
      orderBy: { number: "desc" },
    });
  }

  async create(companyId: string, actor: AuditActor, projectId: string, input: CreateTransmittalInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const existingCount = await this.prisma.transmittal.count({ where: { projectId } });
    const transmittal = await this.prisma.transmittal.create({
      data: {
        companyId,
        projectId,
        number: existingCount + 1,
        recipientName: input.recipientName,
        recipientCompany: input.recipientCompany,
        method: input.method,
        purpose: input.purpose,
        notes: input.notes,
        items: { create: input.items.map((i) => ({ description: i.description, quantity: i.quantity })) },
      },
      include: { items: true },
    });

    this.audit.record(
      companyId,
      actor,
      "transmittal.created",
      "Transmittal",
      transmittal.id,
      `Sent transmittal T-${transmittal.number} to ${input.recipientName} (${input.items.length} item(s)) on "${project.name}"`,
    );
    return transmittal;
  }

  async acknowledge(companyId: string, actor: AuditActor, id: string, input: AcknowledgeTransmittalInput) {
    const transmittal = await this.prisma.transmittal.findFirst({ where: { id, companyId } });
    if (!transmittal) throw new NotFoundException("Transmittal not found");
    if (transmittal.acknowledgedAt) throw new BadRequestException("This transmittal has already been acknowledged");

    const updated = await this.prisma.transmittal.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedByName: input.acknowledgedByName },
    });
    this.audit.record(
      companyId,
      actor,
      "transmittal.acknowledged",
      "Transmittal",
      id,
      `${input.acknowledgedByName} acknowledged receipt of transmittal T-${transmittal.number}`,
    );
    return updated;
  }
}
