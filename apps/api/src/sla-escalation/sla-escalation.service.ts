import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SLA_ESCALATION_QUEUE } from "../common/queue/queue.module";

const SLA_ESCALATION_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Periodically flags open RFIs / punch list items that have sat unanswered/unresolved
 * past their company's configured SLA and emails the company's owner(s). Escalation is
 * a one-way flag (escalatedAt) — answering/closing the item is the only way to clear it,
 * there's no un-escalate. Null rfiSlaDays/punchListSlaDays disables escalation for that
 * company entirely, mirroring Company.approvalThresholdAmount's nullable-disables pattern.
 */
@Injectable()
export class SlaEscalationService implements OnModuleInit {
  private readonly logger = new Logger(SlaEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(SLA_ESCALATION_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: SLA_ESCALATION_CHECK_INTERVAL_MS }, jobId: "sla-escalation-repeat" },
    );
  }

  async runDuePass(): Promise<{ escalated: number }> {
    const companies = await this.prisma.company.findMany({
      where: { OR: [{ rfiSlaDays: { not: null } }, { punchListSlaDays: { not: null } }] },
      select: { id: true, name: true, rfiSlaDays: true, punchListSlaDays: true },
    });

    let escalated = 0;
    for (const company of companies) {
      escalated += await this.escalateOverdueRfis(company);
      escalated += await this.escalateOverduePunchListItems(company);
    }
    return { escalated };
  }

  private async escalateOverdueRfis(company: { id: string; name: string; rfiSlaDays: number | null }): Promise<number> {
    if (!company.rfiSlaDays) return 0;
    const cutoff = new Date(Date.now() - company.rfiSlaDays * DAY_MS);
    const overdue = await this.prisma.rfi.findMany({
      where: { companyId: company.id, status: "open", escalatedAt: null, createdAt: { lte: cutoff } },
    });
    if (overdue.length === 0) return 0;

    await this.prisma.rfi.updateMany({ where: { id: { in: overdue.map((r) => r.id) } }, data: { escalatedAt: new Date() } });
    for (const rfi of overdue) {
      await this.notifyOwners(
        company,
        `RFI ${rfi.number} overdue`,
        `${rfi.number} — ${rfi.subject}`,
        `has been open for more than ${company.rfiSlaDays} day(s) without an answer`,
        `/projects/${rfi.projectId}`,
      );
    }
    return overdue.length;
  }

  private async escalateOverduePunchListItems(company: { id: string; name: string; punchListSlaDays: number | null }): Promise<number> {
    if (!company.punchListSlaDays) return 0;
    const cutoff = new Date(Date.now() - company.punchListSlaDays * DAY_MS);
    const overdue = await this.prisma.punchListItem.findMany({
      where: { companyId: company.id, status: "open", escalatedAt: null, createdAt: { lte: cutoff } },
    });
    if (overdue.length === 0) return 0;

    await this.prisma.punchListItem.updateMany({ where: { id: { in: overdue.map((i) => i.id) } }, data: { escalatedAt: new Date() } });
    for (const item of overdue) {
      await this.notifyOwners(
        company,
        `Punch list item overdue`,
        item.title,
        `has been open for more than ${company.punchListSlaDays} day(s) without being resolved`,
        `/projects/${item.projectId}`,
      );
    }
    return overdue.length;
  }

  private async notifyOwners(
    company: { id: string; name: string },
    subject: string,
    itemLabel: string,
    reason: string,
    linkPath: string,
  ): Promise<void> {
    const owners = await this.prisma.membership.findMany({
      where: { companyId: company.id, role: "owner" },
      include: { user: { select: { email: true } } },
    });
    if (owners.length === 0) {
      this.logger.warn(`No owner to notify for escalated item in company ${company.id}`);
      return;
    }

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}${linkPath}`;
    for (const owner of owners) {
      await this.mail.send({
        to: owner.user.email,
        subject: `[${company.name}] ${subject}`,
        html: `<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${subject}</h2><p>${itemLabel} ${reason}.</p><p style="margin-top:16px;"><a href="${link}">Open in Cantero →</a></p></div>`,
        text: `${subject}\n\n${itemLabel} ${reason}.\n\nOpen: ${link}`,
      });
    }
  }
}
