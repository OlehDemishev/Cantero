import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SERVICE_VISIT_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { html } from "../common/mail/html";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;

/** Emails the company owner(s) once a due maintenance visit falls inside the lookahead window —
 * doesn't auto-create the ServiceVisit itself, since scheduling one needs a technician/date
 * decision a person should make. Re-runs daily; a contract stops appearing here the moment its
 * nextVisitDate is pushed forward by ServiceVisitsService.schedule(). */
@Injectable()
export class ServiceVisitRemindersService implements OnModuleInit {
  private readonly logger = new Logger(ServiceVisitRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(SERVICE_VISIT_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: CHECK_INTERVAL_MS }, jobId: "service-visit-reminders-repeat" });
  }

  async runDuePass(): Promise<{ notified: number }> {
    const cutoff = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const dueContracts = await this.prisma.serviceContract.findMany({
      where: { active: true, nextVisitDate: { lte: cutoff } },
      include: { company: { select: { id: true, name: true } }, project: { select: { name: true } } },
    });

    let notified = 0;
    for (const contract of dueContracts) {
      const owners = await this.prisma.membership.findMany({
        where: { companyId: contract.companyId, role: "owner" },
        include: { user: { select: { email: true } } },
      });
      if (owners.length === 0) {
        this.logger.warn(`No owner to notify for due service contract ${contract.id}`);
        continue;
      }

      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/service-contracts/${contract.id}`;
      for (const owner of owners) {
        await this.mail.send({
          to: owner.user.email,
          subject: `[${contract.company.name}] Service visit due: ${contract.title}`,
          text: `"${contract.title}" (${contract.project.name}) is due for its next service visit on ${contract.nextVisitDate.toLocaleDateString()}. Schedule it here: ${link}`,
          html: html`<p><strong>${contract.title}</strong> (${contract.project.name}) is due for its next service visit on ${contract.nextVisitDate.toLocaleDateString()}.</p><p><a href="${link}">Schedule it →</a></p>`,
        });
      }
      notified++;
    }
    return { notified };
  }
}
