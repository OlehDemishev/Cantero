import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { STOCK_LOT_EXPIRING_QUEUE } from "../common/queue/queue.module";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;

/** Emails the company owner(s) once a StockLot's expiresAt falls inside the lookahead window —
 * same shape as PermitExpiringRemindersService/ServiceVisitRemindersService. Doesn't touch the
 * lot's quantity automatically (disposing/using it up is a human decision); just flags it once
 * via expiringNotifiedAt so the daily pass doesn't re-send. Only lots still holding stock
 * (remainingQuantity > 0) are worth notifying about — a drained lot's expiry is moot. */
@Injectable()
export class LotExpiringRemindersService implements OnModuleInit {
  private readonly logger = new Logger(LotExpiringRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @InjectQueue(STOCK_LOT_EXPIRING_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add("run-due", {}, { repeat: { every: CHECK_INTERVAL_MS }, jobId: "stock-lot-expiring-repeat" });
  }

  async runDuePass(): Promise<{ notified: number }> {
    const cutoff = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.stockLot.findMany({
      where: { expiresAt: { lte: cutoff, gte: new Date() }, expiringNotifiedAt: null, remainingQuantity: { gt: 0 } },
      include: {
        company: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        materialCatalogItem: { select: { name: true, unit: true } },
      },
    });

    let notified = 0;
    for (const lot of expiring) {
      const owners = await this.prisma.membership.findMany({
        where: { companyId: lot.companyId, role: "owner" },
        include: { user: { select: { email: true } } },
      });
      if (owners.length === 0) {
        this.logger.warn(`No owner to notify for expiring lot ${lot.id}`);
        continue;
      }

      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/warehouses`;
      const quantity = Number(lot.remainingQuantity);
      const subject = `[${lot.company.name}] Lot expiring: ${lot.materialCatalogItem.name} (${lot.lotNumber})`;
      const body = `Lot "${lot.lotNumber}" of ${lot.materialCatalogItem.name} at ${lot.warehouse.name} (${quantity}${lot.materialCatalogItem.unit} remaining) expires on ${lot.expiresAt!.toLocaleDateString()}.`;
      for (const owner of owners) {
        await this.mail.send({
          to: owner.user.email,
          subject,
          text: `${body} Review it here: ${link}`,
          html: `<p>${body}</p><p><a href="${link}">Open warehouses →</a></p>`,
        });
      }
      await this.prisma.stockLot.update({ where: { id: lot.id }, data: { expiringNotifiedAt: new Date() } });
      notified++;
    }
    return { notified };
  }
}
