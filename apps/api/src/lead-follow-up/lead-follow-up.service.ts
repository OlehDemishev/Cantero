import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { LEAD_FOLLOW_UP_QUEUE } from "../common/queue/queue.module";
import { html, multiline } from "../common/mail/html";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days-since-created thresholds for follow-up #1, #2, #3 — fixed cadence, leadFollowUpEnabled is the only knob. */
const CADENCE_DAYS = [1, 3, 7];

const TONE = [
  (name: string) => ({
    subject: `Following up on your inquiry`,
    body: `Hi ${name},\n\nThanks for reaching out — I wanted to follow up and see if you had any questions or if there's anything we can help with.`,
  }),
  (name: string) => ({
    subject: `Still interested in moving forward?`,
    body: `Hi ${name},\n\nJust checking back in — we'd love to help with your project whenever you're ready. Let us know if you have any questions.`,
  }),
  (name: string) => ({
    subject: `Last check-in`,
    body: `Hi ${name},\n\nThis is our last scheduled check-in. If you're still interested, just reply here and we'll pick up right where we left off.`,
  }),
];

/**
 * Escalating day-1/3/7 follow-up emails to leads still sitting in stage="lead", opt-in per
 * company (Company.leadFollowUpEnabled). Self-clearing: once a lead moves to another stage it
 * stops matching the query, same as InvoiceRemindersService's items. Caps at CADENCE_DAYS.length
 * follow-ups; beyond that it's assumed a human has taken over.
 */
@Injectable()
export class LeadFollowUpService implements OnModuleInit {
  private readonly logger = new Logger(LeadFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @InjectQueue(LEAD_FOLLOW_UP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: CHECK_INTERVAL_MS }, jobId: "lead-follow-up-repeat" },
    );
  }

  async runDuePass(): Promise<{ sent: number }> {
    const companies = await this.prisma.company.findMany({
      where: { leadFollowUpEnabled: true },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const company of companies) sent += await this.followUpLeads(company);
    return { sent };
  }

  private async followUpLeads(company: { id: string; name: string }): Promise<number> {
    const now = new Date();
    const leads = await this.prisma.client.findMany({
      where: { companyId: company.id, stage: "lead", leadFollowUpCount: { lt: CADENCE_DAYS.length } },
    });

    let sent = 0;
    for (const lead of leads) {
      const daysSinceCreated = Math.floor((now.getTime() - lead.createdAt.getTime()) / DAY_MS);
      const nextThreshold = CADENCE_DAYS[lead.leadFollowUpCount];
      if (daysSinceCreated < nextThreshold) continue;
      if (!lead.email) continue;

      await this.sendFollowUp(company, lead, lead.leadFollowUpCount);
      await this.prisma.client.update({
        where: { id: lead.id },
        data: { leadFollowUpCount: lead.leadFollowUpCount + 1, lastLeadFollowUpSentAt: now },
      });
      sent++;
    }
    return sent;
  }

  private async sendFollowUp(company: { id: string; name: string }, lead: { email: string | null; name: string }, toneIndex: number): Promise<void> {
    const { subject, body } = TONE[toneIndex](lead.name);
    await this.mail.send({
      to: lead.email!,
      subject: `[${company.name}] ${subject}`,
      html: html`<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${subject}</h2><p>${multiline(body)}</p></div>`,
      text: body,
    });
  }
}
