import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SendCrewSmsBroadcastInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";

/**
 * One-way mass SMS to crew — distinct from SmsWebhooksService's two-way, per-task status texts
 * (Phase 103). No reply is expected or parsed; this is for "job site closed tomorrow" style
 * announcements. Scoped to a project's currently-assigned workers, or company-wide when no
 * project is given.
 */
@Injectable()
export class CrewSmsBroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  async send(companyId: string, actor: AuditActor, input: SendCrewSmsBroadcastInput) {
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    const workers = await this.prisma.worker.findMany({
      where: {
        companyId,
        active: true,
        phone: { not: null },
        ...(input.projectId
          ? { resourceAssignments: { some: { projectId: input.projectId, endDate: { gte: new Date() } } } }
          : {}),
      },
      select: { phone: true },
    });
    if (workers.length === 0) {
      throw new BadRequestException("No crew members with a phone number on file to notify");
    }

    await Promise.all(workers.map((w) => this.sms.send({ to: w.phone!, body: input.message })));

    const broadcast = await this.prisma.crewSmsBroadcast.create({
      data: {
        companyId,
        projectId: input.projectId,
        message: input.message,
        recipientCount: workers.length,
        sentByUserId: actor.userId,
        sentByName: actor.name,
      },
    });

    this.audit.record(
      companyId,
      actor,
      "crew_sms_broadcast.sent",
      "CrewSmsBroadcast",
      broadcast.id,
      `Broadcast SMS to ${workers.length} crew member(s)${input.projectId ? "" : " (company-wide)"}`,
    );
    return broadcast;
  }

  async list(companyId: string, projectId?: string) {
    return this.prisma.crewSmsBroadcast.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
