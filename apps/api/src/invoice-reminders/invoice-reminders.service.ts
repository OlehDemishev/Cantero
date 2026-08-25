import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { InvoicesService } from "../finance/invoices.service";
import { INVOICE_REMINDERS_QUEUE } from "../common/queue/queue.module";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days-overdue thresholds for reminder #1, #2, #3, #4 — the cadence is fixed, not per-company configurable, to keep the feature simple; invoiceRemindersEnabled is the only knob. */
const CADENCE_DAYS = [3, 7, 14, 30];

const TONE = [
  (number: string) => ({
    subject: `Reminder: Invoice ${number} is overdue`,
    body: `This is a friendly reminder that invoice ${number} is now past its due date. If you've already sent payment, please disregard this message.`,
  }),
  (number: string) => ({
    subject: `Invoice ${number} is now overdue`,
    body: `Invoice ${number} remains unpaid past its due date. Please arrange payment at your earliest convenience, or contact us if you have any questions.`,
  }),
  (number: string) => ({
    subject: `Invoice ${number} is significantly overdue`,
    body: `Invoice ${number} is now significantly overdue. Please contact us as soon as possible to resolve this — further delay may affect ongoing work.`,
  }),
  (number: string) => ({
    subject: `FINAL NOTICE: Invoice ${number} is overdue`,
    body: `This is a final reminder that invoice ${number} remains unpaid well past its due date. Please contact us immediately to arrange payment.`,
  }),
];

/**
 * Escalating overdue-invoice reminder emails to the client, opt-in per company
 * (Company.invoiceRemindersEnabled). Self-clearing: once an invoice is paid its status
 * leaves "sent" and it stops matching the query, same as SlaEscalationService's items —
 * no explicit reset of reminderCount needed. Caps at CADENCE_DAYS.length reminders; beyond
 * that it's assumed a human has taken over collections.
 */
@Injectable()
export class InvoiceRemindersService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
    @InjectQueue(INVOICE_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: CHECK_INTERVAL_MS }, jobId: "invoice-reminders-repeat" },
    );
  }

  async runDuePass(): Promise<{ sent: number }> {
    const companies = await this.prisma.company.findMany({
      where: { invoiceRemindersEnabled: true },
      select: { id: true, name: true, currency: true },
    });

    let sent = 0;
    for (const company of companies) sent += await this.remindOverdueInvoices(company);
    return { sent };
  }

  private async remindOverdueInvoices(company: { id: string; name: string; currency: string }): Promise<number> {
    const now = new Date();
    const overdue = await this.prisma.invoice.findMany({
      where: { companyId: company.id, status: "sent", dueDate: { lt: now }, reminderCount: { lt: CADENCE_DAYS.length } },
      include: { client: true },
    });

    let sent = 0;
    for (const invoice of overdue) {
      const daysOverdue = Math.floor((now.getTime() - invoice.dueDate!.getTime()) / DAY_MS);
      const nextThreshold = CADENCE_DAYS[invoice.reminderCount];
      if (daysOverdue < nextThreshold) continue;
      if (!invoice.client.email) continue;

      await this.sendReminder(company, invoice, invoice.reminderCount);
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { reminderCount: invoice.reminderCount + 1, lastReminderSentAt: now },
      });
      sent++;
    }
    return sent;
  }

  private async sendReminder(
    company: { id: string; name: string; currency: string },
    invoice: { id: string; number: string; total: unknown; client: { email: string | null } },
    toneIndex: number,
  ): Promise<void> {
    const { subject, body } = TONE[toneIndex](invoice.number);
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}/invoices/${invoice.id}`;

    let pdf: Buffer | undefined;
    try {
      pdf = await this.invoices.generatePdf(company.id, invoice.id);
    } catch (err) {
      this.logger.warn(`Couldn't attach PDF to reminder for invoice ${invoice.number}: ${(err as Error).message}`);
    }

    await this.mail.send({
      to: invoice.client.email!,
      subject: `[${company.name}] ${subject}`,
      html: `<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${subject}</h2><p>${body}</p><p>Amount due: <strong>${invoice.total} ${company.currency}</strong></p><p style="margin-top:16px;"><a href="${link}">View invoice →</a></p></div>`,
      text: `${subject}\n\n${body}\n\nAmount due: ${invoice.total} ${company.currency}\n\nView: ${link}`,
      ...(pdf ? { attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }] } : {}),
    });
  }
}
