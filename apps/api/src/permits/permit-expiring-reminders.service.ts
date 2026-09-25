import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { PERMIT_EXPIRING_QUEUE } from "../common/queue/queue.module";
import { html } from "../common/mail/html";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 30;

/** Emails the company owner(s) once a permit's expiresAt falls inside the lookahead window —
 * same shape as ServiceVisitRemindersService/EquipmentMaintenanceSchedulerService. Doesn't touch
 * the permit's status automatically (renewal is a human decision); just flags it once via
 * expiringNotifiedAt so the daily pass doesn't re-send. */
@Injectable()
export class PermitExpiringRemindersService implements OnModuleInit {
  private readonly logger = new Logger(PermitExpiringRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(PERMIT_EXPIRING_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: CHECK_INTERVAL_MS }, jobId: "permit-expiring-repeat" });
  }

  async runDuePass(): Promise<{ notified: number }> {
    const cutoff = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.permit.findMany({
      where: { expiresAt: { lte: cutoff, gte: new Date() }, expiringNotifiedAt: null, status: { notIn: ["expired", "rejected"] } },
      include: { company: { select: { id: true, name: true } }, project: { select: { name: true } } },
    });

    let notified = 0;
    for (const permit of expiring) {
      const owners = await this.prisma.membership.findMany({
        where: { companyId: permit.companyId, role: "owner" },
        include: { user: { select: { email: true } } },
      });
      if (owners.length === 0) {
        this.logger.warn(`No owner to notify for expiring permit ${permit.id}`);
        continue;
      }

      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/projects/${permit.projectId}`;
      const label = permit.permitNumber ?? permit.permitType;
      for (const owner of owners) {
        await this.mail.send({
          to: owner.user.email,
          subject: `[${permit.company.name}] Permit expiring: ${label}`,
          text: `The ${permit.permitType} permit (${label}) for "${permit.project.name}" expires on ${permit.expiresAt!.toLocaleDateString()}. Renew or follow up here: ${link}`,
          html: html`<p>The <strong>${permit.permitType}</strong> permit (${label}) for "${permit.project.name}" expires on ${permit.expiresAt!.toLocaleDateString()}.</p><p><a href="${link}">Open project →</a></p>`,
        });
      }
      await this.prisma.permit.update({ where: { id: permit.id }, data: { expiringNotifiedAt: new Date() } });
      notified++;
    }
    return { notified };
  }
}
