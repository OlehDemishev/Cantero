import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { ChangeOrdersService } from "../estimates/change-orders.service";
import { CHANGE_ORDER_REMINDERS_QUEUE } from "../common/queue/queue.module";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Same cadence as EstimateRemindersService — reminder #1, #2, #3 at these days-since-sent thresholds. */
const CADENCE_DAYS = [3, 7, 14];

const TONE = [
  (title: string) => ({
    subject: `Following up on change order "${title}"`,
    body: `Just checking in to see if you've had a chance to review this change order. Let us know if you have any questions.`,
  }),
  (title: string) => ({
    subject: `Change order "${title}" is still awaiting your decision`,
    body: `The change order is still awaiting your decision. If anything needs adjusting, we're happy to help — just let us know.`,
  }),
  (title: string) => ({
    subject: `Last reminder: change order "${title}"`,
    body: `This is our last scheduled reminder about this change order. If you're still interested, just click through and let us know your decision.`,
  }),
];

/**
 * Escalating reminder emails for change orders that were sent but the client hasn't decided yet,
 * opt-in per company (Company.changeOrderRemindersEnabled). Mirrors EstimateRemindersService
 * exactly, one field renamed (title instead of name) and one extra hop through Estimate → Project
 * to reach the client, since ChangeOrder doesn't have its own projectId.
 */
@Injectable()
export class ChangeOrderRemindersService implements OnModuleInit {
  private readonly logger = new Logger(ChangeOrderRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly changeOrders: ChangeOrdersService,
    private readonly config: ConfigService,
    @InjectQueue(CHANGE_ORDER_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: CHECK_INTERVAL_MS }, jobId: "change-order-reminders-repeat" },
    );
  }

  async runDuePass(): Promise<{ sent: number }> {
    const companies = await this.prisma.company.findMany({
      where: { changeOrderRemindersEnabled: true },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const company of companies) sent += await this.remindPendingChangeOrders(company);
    return { sent };
  }

  private async remindPendingChangeOrders(company: { id: string; name: string }): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.changeOrder.findMany({
      where: {
        companyId: company.id,
        sentAt: { not: null },
        clientDecision: "pending",
        reminderCount: { lt: CADENCE_DAYS.length },
      },
      include: { estimate: { include: { project: { include: { client: true } } } } },
    });

    let sent = 0;
    for (const changeOrder of pending) {
      const daysSinceSent = Math.floor((now.getTime() - changeOrder.sentAt!.getTime()) / DAY_MS);
      const nextThreshold = CADENCE_DAYS[changeOrder.reminderCount];
      if (daysSinceSent < nextThreshold) continue;
      const email = changeOrder.estimate.project?.client?.email;
      if (!email) continue;

      await this.sendReminder(company, changeOrder, email, changeOrder.reminderCount);
      await this.prisma.changeOrder.update({
        where: { id: changeOrder.id },
        data: { reminderCount: changeOrder.reminderCount + 1, lastReminderSentAt: now },
      });
      sent++;
    }
    return sent;
  }

  private async sendReminder(
    company: { id: string; name: string },
    changeOrder: { id: string; title: string; clientAccessToken: string | null },
    email: string,
    toneIndex: number,
  ): Promise<void> {
    const { subject, body } = TONE[toneIndex](changeOrder.title);
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = changeOrder.clientAccessToken ? `${webOrigin}/change-order/${changeOrder.clientAccessToken}` : undefined;

    let pdf: Buffer | undefined;
    try {
      pdf = await this.changeOrders.generatePdf(company.id, changeOrder.id);
    } catch (err) {
      this.logger.warn(`Couldn't attach PDF to reminder for change order ${changeOrder.title}: ${(err as Error).message}`);
    }

    await this.mail.send({
      to: email,
      subject: `[${company.name}] ${subject}`,
      html: `<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${subject}</h2><p>${body}</p>${link ? `<p style="margin-top:16px;"><a href="${link}">Review change order →</a></p>` : ""}</div>`,
      text: `${subject}\n\n${body}${link ? `\n\nReview: ${link}` : ""}`,
      ...(pdf ? { attachments: [{ filename: `${changeOrder.title}.pdf`, content: pdf, contentType: "application/pdf" }] } : {}),
    });
  }
}
