import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import * as webpush from "web-push";
import type { PushSubscribeInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PUSH_CHECK_QUEUE } from "../common/queue/queue.module";
import { NotificationsService } from "./notifications.service";

const PUSH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Above this many fresh items in one tick, sending one push per item would be noisy — fall back
 * to a single summary push instead (same behavior as before this batch). */
const MAX_INDIVIDUAL_PUSHES = 5;

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  type?: string;
  severity?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectQueue(PUSH_CHECK_QUEUE) private readonly queue: Queue,
  ) {
    webpush.setVapidDetails(
      this.config.getOrThrow<string>("VAPID_SUBJECT"),
      this.config.getOrThrow<string>("VAPID_PUBLIC_KEY"),
      this.config.getOrThrow<string>("VAPID_PRIVATE_KEY"),
    );
  }

  async onModuleInit() {
    // Same jobId + repeat options on every boot — BullMQ dedupes rather than stacking repeats.
    await this.queue.add("check-all", {}, { repeat: { every: PUSH_CHECK_INTERVAL_MS }, jobId: "push-check-repeat" });
  }

  getPublicKey() {
    return { publicKey: this.config.getOrThrow<string>("VAPID_PUBLIC_KEY") };
  }

  async subscribe(companyId: string, userId: string, input: PushSubscribeInput) {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId, companyId } },
    });
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { membershipId: membership.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
      update: { membershipId: membership.id, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
    return { ok: true };
  }

  async unsubscribe(companyId: string, userId: string, endpoint: string) {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId, companyId } },
    });
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, membershipId: membership.id } });
    return { ok: true };
  }

  /** Runs on the periodic queue tick: for every membership with at least one subscription, pushes anything newly derived since it was last notified. */
  async checkAndNotifyAll() {
    const memberships = await this.prisma.membership.findMany({
      where: { pushSubscriptions: { some: {} } },
    });

    for (const membership of memberships) {
      const { notifications } = await this.notifications.list(membership.companyId, membership.userId);
      const cursor = membership.pushNotificationsLastSentAt?.getTime() ?? 0;
      const fresh = notifications.filter((n) => n.occurredAt.getTime() > cursor);
      if (fresh.length === 0) continue;

      // Below the cap, each item gets its own notification — tagged by its stable `key` so a
      // later re-check that finds the same item still fresh (e.g. its dueDate is still overdue)
      // replaces the existing notification on screen rather than stacking a duplicate — carrying
      // over its type/severity so the client can style/route it instead of a generic alert.
      const payloads: PushPayload[] =
        fresh.length <= MAX_INDIVIDUAL_PUSHES
          ? fresh.map((n) => ({ title: n.title, body: n.body, url: n.link, tag: n.key, type: n.type, severity: n.severity }))
          : [
              {
                title: `Cantero: ${fresh.length} new alerts`,
                body: fresh
                  .slice(0, 3)
                  .map((n) => n.title)
                  .join(" · "),
                url: "/dashboard",
                tag: "summary",
              },
            ];

      for (const payload of payloads) {
        await this.sendToMembership(membership.id, payload);
      }
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { pushNotificationsLastSentAt: new Date() },
      });
    }
  }

  private async sendToMembership(membershipId: string, payload: PushPayload) {
    const subs = await this.prisma.pushSubscription.findMany({ where: { membershipId } });
    await Promise.all(subs.map((sub) => this.sendToSubscription(sub, payload)));
  }

  private async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Browser vendor has invalidated this subscription (uninstalled, permission revoked, etc.) — stop tracking it.
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        this.logger.warn(`Push send failed for subscription ${sub.id}: ${(err as Error).message ?? err}`);
      }
    }
  }
}
