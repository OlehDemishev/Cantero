import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CompleteServiceVisitInput, ScheduleServiceVisitInput, SubmitServiceVisitFeedbackInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { addMonthsUtc } from "../common/date-utils";
import { html } from "../common/mail/html";

@Injectable()
export class ServiceVisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Schedules a visit and advances the contract's nextVisitDate by one cadence step, so the
   * reminder job doesn't nag about a visit that's already been booked. */
  async schedule(companyId: string, actor: AuditActor, contractId: string, input: ScheduleServiceVisitInput) {
    const contract = await this.prisma.serviceContract.findFirst({ where: { id: contractId, companyId } });
    if (!contract) throw new NotFoundException("Service contract not found");
    if (input.technicianWorkerId) {
      const worker = await this.prisma.worker.findFirst({ where: { id: input.technicianWorkerId, companyId } });
      if (!worker) throw new BadRequestException("Technician does not belong to this company");
    }

    const scheduledDate = new Date(input.scheduledDate);
    const visit = await this.prisma.serviceVisit.create({
      data: {
        serviceContractId: contractId,
        companyId,
        scheduledDate,
        technicianWorkerId: input.technicianWorkerId,
        notes: input.notes,
        feedbackToken: randomBytes(16).toString("hex"),
      },
    });

    const nextVisitDate = addMonthsUtc(scheduledDate, contract.frequencyMonths);
    await this.prisma.serviceContract.update({ where: { id: contractId }, data: { nextVisitDate } });

    this.audit.record(companyId, actor, "service_visit.scheduled", "ServiceVisit", visit.id, `Scheduled a service visit for "${contract.title}"`);
    return visit;
  }

  async complete(companyId: string, actor: AuditActor, id: string, input: CompleteServiceVisitInput) {
    const visit = await this.prisma.serviceVisit.findFirst({
      where: { id, companyId },
      include: { serviceContract: { include: { client: true } } },
    });
    if (!visit) throw new NotFoundException("Service visit not found");

    const updated = await this.prisma.serviceVisit.update({
      where: { id },
      data: { completedAt: new Date(), notes: input.notes ?? visit.notes },
    });

    this.audit.record(companyId, actor, "service_visit.completed", "ServiceVisit", id, `Completed a service visit for "${visit.serviceContract.title}"`);

    if (visit.serviceContract.client.email) {
      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/service-feedback/${visit.feedbackToken}`;
      await this.mail.send({
        to: visit.serviceContract.client.email,
        subject: "How was your service visit?",
        text: `Hi ${visit.serviceContract.client.name},\n\nWe just completed a service visit for "${visit.serviceContract.title}". We'd love your feedback: ${link}\n\nThank you!`,
        html: html`<p>Hi ${visit.serviceContract.client.name},</p><p>We just completed a service visit for <strong>${visit.serviceContract.title}</strong>. We'd love your feedback:</p><p><a href="${link}">${link}</a></p><p>Thank you!</p>`,
      });
    }

    return updated;
  }

  async submitFeedback(feedbackToken: string, input: SubmitServiceVisitFeedbackInput) {
    const visit = await this.prisma.serviceVisit.findUnique({ where: { feedbackToken } });
    if (!visit) throw new NotFoundException("Feedback link not found");
    if (!visit.completedAt) throw new BadRequestException("This visit hasn't been completed yet");
    if (visit.satisfactionRating !== null) throw new BadRequestException("Feedback has already been submitted for this visit");

    return this.prisma.serviceVisit.update({
      where: { id: visit.id },
      data: { satisfactionRating: input.rating, satisfactionComment: input.comment },
    });
  }
}
