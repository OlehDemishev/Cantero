import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { NOTIFICATION_DIGEST_QUEUE } from "../common/queue/queue.module";
import { NotificationsService } from "./notifications.service";
import { html } from "../common/mail/html";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FREQUENCY_INTERVAL_MS: Record<"daily" | "weekly", number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

/**
 * Opt-in email summary of what's new since the member's last digest. Mirrors PushService's
 * cursor-based "notify what's new since last time" pattern, with its own independent cursor
 * (emailDigestLastSentAt) — a member can have push on, digest on, both, or neither, without
 * them interfering with each other's "already seen" bookkeeping.
 */
@Injectable()
export class NotificationDigestService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectQueue(NOTIFICATION_DIGEST_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: CHECK_INTERVAL_MS }, jobId: "notification-digest-repeat" });
  }

  async runDuePass(): Promise<{ sent: number }> {
    const memberships = await this.prisma.membership.findMany({
      where: { emailDigestFrequency: { not: "off" } },
      include: { user: { select: { email: true, name: true } }, company: { select: { name: true } } },
    });

    let sent = 0;
    const now = Date.now();
    for (const membership of memberships) {
      const frequency = membership.emailDigestFrequency as "daily" | "weekly";
      const intervalMs = FREQUENCY_INTERVAL_MS[frequency];
      const due = !membership.emailDigestLastSentAt || membership.emailDigestLastSentAt.getTime() + intervalMs <= now;
      if (!due) continue;

      const cursor = membership.emailDigestLastSentAt?.getTime() ?? 0;
      const { notifications } = await this.notifications.list(membership.companyId, membership.userId, membership.role);
      const fresh = notifications.filter((n) => n.occurredAt.getTime() > cursor);

      if (fresh.length > 0) {
        await this.sendDigest(membership.user.email, membership.user.name, membership.company.name, fresh);
        sent++;
      }
      // Advance regardless of whether anything was found, so an idle period doesn't cause the
      // next check to immediately re-fire (and the clock keeps resetting on schedule).
      await this.prisma.membership.update({ where: { id: membership.id }, data: { emailDigestLastSentAt: new Date() } });
    }
    return { sent };
  }

  private async sendDigest(
    to: string,
    name: string,
    companyName: string,
    items: { title: string; body: string; link: string; severity: string }[],
  ): Promise<void> {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const rowsHtml = items.map(
      (n) =>
        html`<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;"><a href="${webOrigin}${n.link}" style="color:#111;text-decoration:none;font-weight:600;">${n.title}</a><div style="color:#6b7280;font-size:13px;margin-top:2px;">${n.body}</div></td></tr>`,
    );
    const rowsText = items.map((n) => `${n.title} — ${n.body} (${webOrigin}${n.link})`).join("\n");

    await this.mail.send({
      to,
      subject: `${companyName}: ${items.length} new notification${items.length === 1 ? "" : "s"}`,
      html: html`<div style="font-family:sans-serif;max-width:520px;"><h2 style="margin-bottom:4px;">Hi ${name},</h2><p style="color:#6b7280;margin-top:0;">Here's what's new in ${companyName} since your last digest:</p><table style="border-collapse:collapse;width:100%;">${rowsHtml}</table><p style="margin-top:16px;"><a href="${webOrigin}/dashboard">Open Cantero →</a></p></div>`,
      text: `Hi ${name},\n\nHere's what's new in ${companyName} since your last digest:\n\n${rowsText}\n\nOpen Cantero: ${webOrigin}/dashboard`,
    });
  }
}
