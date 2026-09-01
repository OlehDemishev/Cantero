import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SubmitNpsSurveyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { MessageTemplatesService } from "../message-templates/message-templates.service";

const PROMOTER_MIN_SCORE = 9;
const DETRACTOR_MAX_SCORE = 6;

@Injectable()
export class NpsSurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
    private readonly messageTemplates: MessageTemplatesService,
  ) {}

  /** Sends the survey once per project, mirroring ProjectsService.requestReview's "one manual
   * click, no company-wide toggle needed" pattern. */
  async send(companyId: string, actor: AuditActor, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, include: { client: true } });
    if (!project) throw new NotFoundException("Project not found");
    if (!project.client?.email) throw new BadRequestException("This project's client has no email on file");

    const alreadySent = await this.prisma.npsSurvey.findFirst({ where: { projectId } });
    if (alreadySent) throw new BadRequestException("An NPS survey was already sent for this project");

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const token = randomBytes(16).toString("hex");
    const survey = await this.prisma.npsSurvey.create({ data: { companyId, projectId, token } });

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}/survey/${token}`;
    const custom = await this.messageTemplates.render(companyId, "nps_survey_email", {
      clientName: project.client.name,
      companyName: company.name,
      projectName: project.name,
      surveyUrl: link,
    });

    await this.mail.send({
      to: project.client.email,
      subject: `How likely are you to recommend ${company.name}?`,
      text:
        custom ??
        `Hi ${project.client.name},\n\nNow that "${project.name}" is wrapping up, we'd love to know how we did. Just one quick question: ${link}\n\nThank you!`,
      html: custom
        ? `<p>${custom.replace(/\n/g, "<br>")}</p>`
        : `<p>Hi ${project.client.name},</p><p>Now that <strong>${project.name}</strong> is wrapping up, we'd love to know how we did. Just one quick question:</p><p><a href="${link}">${link}</a></p><p>Thank you!</p>`,
    });

    this.audit.record(companyId, actor, "project.nps_survey_sent", "Project", projectId, `Sent an NPS survey for "${project.name}"`);
    return survey;
  }

  async submit(token: string, input: SubmitNpsSurveyInput) {
    const survey = await this.prisma.npsSurvey.findUnique({ where: { token }, include: { project: true } });
    if (!survey) throw new NotFoundException("Survey link not found");
    if (survey.respondedAt) throw new BadRequestException("This survey has already been submitted");

    const updated = await this.prisma.npsSurvey.update({
      where: { id: survey.id },
      data: { score: input.score, comment: input.comment, respondedAt: new Date() },
    });

    this.webhooks.trigger(survey.companyId, "nps_survey.responded", {
      projectId: survey.projectId,
      projectName: survey.project.name,
      score: input.score,
      comment: input.comment ?? null,
    });

    return updated;
  }

  /** Standard NPS formula: %promoters (9-10) minus %detractors (0-6), on a -100..100 scale. */
  async trend(companyId: string) {
    const responded = await this.prisma.npsSurvey.findMany({
      where: { companyId, respondedAt: { not: null } },
      orderBy: { respondedAt: "asc" },
      select: { score: true, comment: true, respondedAt: true, projectId: true, project: { select: { name: true } } },
    });

    const total = responded.length;
    const promoters = responded.filter((r) => r.score! >= PROMOTER_MIN_SCORE).length;
    const detractors = responded.filter((r) => r.score! <= DETRACTOR_MAX_SCORE).length;
    const npsScore = total === 0 ? null : Math.round(((promoters - detractors) / total) * 100);
    const averageScore = total === 0 ? null : Math.round((responded.reduce((sum, r) => sum + r.score!, 0) / total) * 10) / 10;

    return {
      npsScore,
      averageScore,
      totalResponses: total,
      promoters,
      passives: total - promoters - detractors,
      detractors,
      responses: responded.map((r) => ({
        projectId: r.projectId,
        projectName: r.project.name,
        score: r.score,
        comment: r.comment,
        respondedAt: r.respondedAt,
      })),
    };
  }
}
