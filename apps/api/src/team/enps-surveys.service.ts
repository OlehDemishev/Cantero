import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import type { Locale, SubmitEnpsSurveyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { ENPS_SURVEYS_QUEUE } from "../common/queue/queue.module";

const PROMOTER_MIN_SCORE = 9;
const DETRACTOR_MAX_SCORE = 6;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WAVE_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

function inviteText(locale: Locale, link: string): string {
  switch (locale) {
    case "de":
      return `Kurze, anonyme Frage: Wie wahrscheinlich ist es, dass Sie die Arbeit hier weiterempfehlen? ${link}`;
    case "es":
      return `Una pregunta rápida y anónima: ¿qué probabilidad hay de que recomiende trabajar aquí? ${link}`;
    case "pl":
      return `Krótkie, anonimowe pytanie: jak prawdopodobne jest, że polecisz pracę tutaj? ${link}`;
    case "uk":
      return `Коротке анонімне запитання: наскільки ймовірно ви порекомендуєте роботу тут? ${link}`;
    case "en":
    default:
      return `Quick, anonymous question: how likely are you to recommend working here? ${link}`;
  }
}

@Injectable()
export class EnpsSurveysService implements OnModuleInit {
  private readonly logger = new Logger(EnpsSurveysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
    @InjectQueue(ENPS_SURVEYS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: CHECK_INTERVAL_MS }, jobId: "enps-surveys-repeat" });
  }

  /** Runs daily; only companies whose wave is actually due (never sent, or last sent 90+ days
   * ago) get a new one — so the daily tick doesn't mean a daily survey. */
  async runDuePass(): Promise<{ companiesSent: number }> {
    const cutoff = new Date(Date.now() - WAVE_INTERVAL_MS);
    const due = await this.prisma.company.findMany({
      where: { enpsSurveysEnabled: true, OR: [{ lastEnpsSentAt: null }, { lastEnpsSentAt: { lte: cutoff } }] },
      select: { id: true },
    });

    let companiesSent = 0;
    for (const company of due) {
      const sent = await this.sendWave(company.id);
      if (sent > 0) companiesSent++;
    }
    return { companiesSent };
  }

  /** Manually triggers a wave right now, bypassing the 90-day cadence — for an admin who just
   * turned the feature on and doesn't want to wait for the next scheduled tick. */
  async sendNow(companyId: string, actor: AuditActor): Promise<{ sent: number }> {
    const sent = await this.sendWave(companyId);
    this.audit.record(companyId, actor, "enps_survey.wave_sent", "Company", companyId, `Sent an eNPS wave to ${sent} worker(s)`);
    return { sent };
  }

  private async sendWave(companyId: string): Promise<number> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const workers = await this.prisma.worker.findMany({ where: { companyId, active: true, phone: { not: null } } });
    if (workers.length === 0) {
      await this.prisma.company.update({ where: { id: companyId }, data: { lastEnpsSentAt: new Date() } });
      return 0;
    }

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    for (const worker of workers) {
      const token = randomBytes(16).toString("hex");
      await this.prisma.enpsSurvey.create({ data: { companyId, workerId: worker.id, token } });
      const link = `${webOrigin}/enps-survey/${token}`;
      const locale = worker.preferredLocale ?? company.locale;
      await this.sms.send({ to: worker.phone!, body: inviteText(locale, link) });
    }

    await this.prisma.company.update({ where: { id: companyId }, data: { lastEnpsSentAt: new Date() } });
    return workers.length;
  }

  async submit(token: string, input: SubmitEnpsSurveyInput) {
    const survey = await this.prisma.enpsSurvey.findUnique({ where: { token } });
    if (!survey) throw new NotFoundException("Survey link not found");
    if (survey.respondedAt) throw new BadRequestException("This survey has already been submitted");

    const updated = await this.prisma.enpsSurvey.update({
      where: { id: survey.id },
      data: { score: input.score, comment: input.comment, respondedAt: new Date() },
    });

    this.webhooks.trigger(survey.companyId, "enps_survey.responded", { score: input.score, comment: input.comment ?? null });
    return updated;
  }

  /** Same standard NPS formula as NpsSurveysService.trend, aggregate only — no per-worker
   * breakdown, so a respondent is never identifiable from this view. */
  async trend(companyId: string) {
    const responded = await this.prisma.enpsSurvey.findMany({
      where: { companyId, respondedAt: { not: null } },
      orderBy: { respondedAt: "desc" },
      select: { score: true, comment: true, respondedAt: true },
    });

    const total = responded.length;
    const promoters = responded.filter((r) => r.score! >= PROMOTER_MIN_SCORE).length;
    const detractors = responded.filter((r) => r.score! <= DETRACTOR_MAX_SCORE).length;
    const enpsScore = total === 0 ? null : Math.round(((promoters - detractors) / total) * 100);
    const averageScore = total === 0 ? null : Math.round((responded.reduce((sum, r) => sum + r.score!, 0) / total) * 10) / 10;

    return {
      enpsScore,
      averageScore,
      totalResponses: total,
      promoters,
      passives: total - promoters - detractors,
      detractors,
      comments: responded.filter((r) => r.comment).map((r) => ({ comment: r.comment, score: r.score, respondedAt: r.respondedAt })),
    };
  }
}
