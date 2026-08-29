import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSafetyBriefingInput, Locale, UpdateSafetyBriefingInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";
import { smsTemplates } from "../common/sms/sms-templates";

const INCLUDE_ATTENDEES = { attendees: { include: { worker: { select: { id: true, name: true } } } } } as const;

@Injectable()
export class SafetyBriefingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  async listForProject(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.safetyBriefing.findMany({ where: { projectId }, include: INCLUDE_ATTENDEES, orderBy: { date: "desc" } });
  }

  async get(companyId: string, id: string) {
    const briefing = await this.prisma.safetyBriefing.findFirst({ where: { id, companyId }, include: INCLUDE_ATTENDEES });
    if (!briefing) throw new NotFoundException("Safety briefing not found");
    return briefing;
  }

  async create(companyId: string, actor: AuditActor, input: CreateSafetyBriefingInput) {
    const project = await this.assertProject(companyId, input.projectId);
    await this.assertWorkers(companyId, input.attendeeWorkerIds);

    const briefing = await this.prisma.safetyBriefing.create({
      data: {
        companyId,
        projectId: input.projectId,
        date: new Date(input.date),
        topic: input.topic,
        notes: input.notes,
        conductedByUserId: actor.userId,
        conductedByName: actor.name,
        attendees: { create: input.attendeeWorkerIds.map((workerId) => ({ workerId })) },
      },
      include: INCLUDE_ATTENDEES,
    });
    this.audit.record(
      companyId,
      actor,
      "safety_briefing.created",
      "SafetyBriefing",
      briefing.id,
      `Logged toolbox talk "${input.topic}" on "${project.name}" (${input.attendeeWorkerIds.length} attended)`,
    );

    if (project.company.workerSmsNotificationsEnabled) {
      const attendeesWithPhones = await this.prisma.worker.findMany({
        where: { id: { in: input.attendeeWorkerIds }, phone: { not: null } },
        select: { phone: true, preferredLocale: true },
      });
      const dateLabel = briefing.date.toISOString().slice(0, 10);
      for (const attendee of attendeesWithPhones) {
        const locale: Locale = attendee.preferredLocale ?? project.company.locale;
        await this.sms.send({
          to: attendee.phone!,
          body: smsTemplates.safetyBriefingScheduled(locale, input.topic, project.name, dateLabel),
        });
      }
    }

    return briefing;
  }

  async update(companyId: string, id: string, input: UpdateSafetyBriefingInput) {
    const briefing = await this.get(companyId, id);
    if (input.attendeeWorkerIds) await this.assertWorkers(companyId, input.attendeeWorkerIds);

    return this.prisma.safetyBriefing.update({
      where: { id: briefing.id },
      data: {
        topic: input.topic,
        notes: input.notes,
        ...(input.attendeeWorkerIds
          ? { attendees: { deleteMany: {}, create: input.attendeeWorkerIds.map((workerId) => ({ workerId })) } }
          : {}),
      },
      include: INCLUDE_ATTENDEES,
    });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: { company: { select: { workerSmsNotificationsEnabled: true, locale: true } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertWorkers(companyId: string, workerIds: string[]) {
    if (workerIds.length === 0) return;
    const count = await this.prisma.worker.count({ where: { id: { in: workerIds }, companyId } });
    if (count !== new Set(workerIds).size) throw new BadRequestException("One or more attendees do not belong to this company");
  }
}
