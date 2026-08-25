import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { AuditService } from "../common/audit/audit.service";
import { EQUIPMENT_MAINTENANCE_QUEUE } from "../common/queue/queue.module";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Periodically pulls overdue equipment out of service and emails the company owner(s).
 * Only equipment currently "available" is auto-transitioned to "maintenance" — equipment that's
 * "in_use" is left alone (an active job shouldn't be disrupted mid-use) but still triggers the
 * email; it'll be caught and transitioned on the next pass once checked back in.
 */
@Injectable()
export class EquipmentMaintenanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(EquipmentMaintenanceSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue(EQUIPMENT_MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: CHECK_INTERVAL_MS }, jobId: "equipment-maintenance-repeat" },
    );
  }

  async runDuePass(): Promise<{ flagged: number }> {
    const overdue = await this.prisma.equipment.findMany({
      where: { nextMaintenanceDueAt: { lte: new Date() }, status: { in: ["available", "in_use"] } },
      include: { company: { select: { name: true } } },
    });

    let flagged = 0;
    for (const equipment of overdue) {
      if (equipment.status === "available") {
        await this.prisma.equipment.update({ where: { id: equipment.id }, data: { status: "maintenance" } });
        this.audit.record(
          equipment.companyId,
          { name: "Scheduled maintenance" },
          "equipment.maintenance_auto_started",
          "Equipment",
          equipment.id,
          `Automatically pulled "${equipment.name}" out of service — preventive maintenance is due`,
        );
        await this.notifyOwners(equipment.companyId, equipment.company.name, equipment.id, equipment.name, false);
        flagged++;
      } else if (!equipment.maintenanceOverdueNotifiedAt) {
        // in_use and not yet flagged — notify once, then stay quiet until it's checked in and completed.
        await this.prisma.equipment.update({ where: { id: equipment.id }, data: { maintenanceOverdueNotifiedAt: new Date() } });
        await this.notifyOwners(equipment.companyId, equipment.company.name, equipment.id, equipment.name, true);
        flagged++;
      }
    }
    return { flagged };
  }

  private async notifyOwners(
    companyId: string,
    companyName: string,
    equipmentId: string,
    equipmentName: string,
    stillInUse: boolean,
  ): Promise<void> {
    const owners = await this.prisma.membership.findMany({
      where: { companyId, role: "owner" },
      include: { user: { select: { email: true } } },
    });
    if (owners.length === 0) {
      this.logger.warn(`No owner to notify for overdue maintenance in company ${companyId}`);
      return;
    }

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}/equipment/${equipmentId}`;
    const statusNote = stillInUse
      ? "It's currently checked out, so it wasn't pulled out of service automatically — it will be as soon as it's checked back in."
      : "It has been automatically marked as in maintenance and can't be checked out until maintenance is completed.";

    for (const owner of owners) {
      await this.mail.send({
        to: owner.user.email,
        subject: `[${companyName}] Preventive maintenance due: ${equipmentName}`,
        html: `<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">Preventive maintenance due</h2><p>${equipmentName} is due for scheduled maintenance. ${statusNote}</p><p style="margin-top:16px;"><a href="${link}">Open in Cantero →</a></p></div>`,
        text: `Preventive maintenance due\n\n${equipmentName} is due for scheduled maintenance. ${statusNote}\n\nOpen: ${link}`,
      });
    }
  }
}
