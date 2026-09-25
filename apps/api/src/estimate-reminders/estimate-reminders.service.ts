import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { EstimatesService } from "../estimates/estimates.service";
import { ESTIMATE_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { html } from "../common/mail/html";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days-since-sent thresholds for reminder #1, #2, #3 — fixed cadence, estimateRemindersEnabled is the only knob. */
const CADENCE_DAYS = [3, 7, 14];

const TONE = [
  (name: string) => ({
    subject: `Following up on estimate "${name}"`,
    body: `Just checking in to see if you've had a chance to review the estimate. Let us know if you have any questions.`,
  }),
  (name: string) => ({
    subject: `Estimate "${name}" is still awaiting your decision`,
    body: `The estimate is still awaiting your decision. If anything needs adjusting, we're happy to help — just let us know.`,
  }),
  (name: string) => ({
    subject: `Last reminder: estimate "${name}"`,
    body: `This is our last scheduled reminder about this estimate. If you're still interested, just click through and let us know your decision.`,
  }),
];

/**
 * Escalating reminder emails for estimates that were sent but the client hasn't decided yet,
 * opt-in per company (Company.estimateRemindersEnabled). Self-clearing: once the client decides,
 * clientDecision leaves "pending" and it stops matching the query, same as InvoiceRemindersService's
 * items. Caps at CADENCE_DAYS.length reminders; beyond that it's assumed a human has taken over.
 */
@Injectable()
export class EstimateRemindersService implements OnModuleInit {
  private readonly logger = new Logger(EstimateRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly estimates: EstimatesService,
    private readonly config: ConfigService,
    @InjectQueue(ESTIMATE_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: CHECK_INTERVAL_MS }, jobId: "estimate-reminders-repeat" },
    );
  }

  async runDuePass(): Promise<{ sent: number }> {
    const companies = await this.prisma.company.findMany({
      where: { estimateRemindersEnabled: true },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const company of companies) sent += await this.remindPendingEstimates(company);
    return { sent };
  }

  private async remindPendingEstimates(company: { id: string; name: string }): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.estimate.findMany({
      where: {
        companyId: company.id,
        sentAt: { not: null },
        clientDecision: "pending",
        reminderCount: { lt: CADENCE_DAYS.length },
      },
      include: { project: { include: { client: true } } },
    });

    let sent = 0;
    for (const estimate of pending) {
      const daysSinceSent = Math.floor((now.getTime() - estimate.sentAt!.getTime()) / DAY_MS);
      const nextThreshold = CADENCE_DAYS[estimate.reminderCount];
      if (daysSinceSent < nextThreshold) continue;
      const email = estimate.project?.client?.email;
      if (!email) continue;

      await this.sendReminder(company, estimate, email, estimate.reminderCount);
      await this.prisma.estimate.update({
        where: { id: estimate.id },
        data: { reminderCount: estimate.reminderCount + 1, lastReminderSentAt: now },
      });
      sent++;
    }
    return sent;
  }

  private async sendReminder(
    company: { id: string; name: string },
    estimate: { id: string; name: string; clientAccessToken: string | null },
    email: string,
    toneIndex: number,
  ): Promise<void> {
    const { subject, body } = TONE[toneIndex](estimate.name);
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = estimate.clientAccessToken ? `${webOrigin}/estimate/${estimate.clientAccessToken}` : undefined;

    let pdf: Buffer | undefined;
    try {
      pdf = await this.estimates.generatePdf(company.id, estimate.id);
    } catch (err) {
      this.logger.warn(`Couldn't attach PDF to reminder for estimate ${estimate.name}: ${(err as Error).message}`);
    }

    await this.mail.send({
      to: email,
      subject: `[${company.name}] ${subject}`,
      html: html`<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${subject}</h2><p>${body}</p>${link ? html`<p style="margin-top:16px;"><a href="${link}">Review estimate →</a></p>` : ""}</div>`,
      text: `${subject}\n\n${body}${link ? `\n\nReview: ${link}` : ""}`,
      ...(pdf ? { attachments: [{ filename: `${estimate.name}.pdf`, content: pdf, contentType: "application/pdf" }] } : {}),
    });
  }
}
