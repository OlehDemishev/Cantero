import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import * as webpush from "web-push";
import type { PushSubscribeInput, RegisterDeviceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PUSH_CHECK_QUEUE } from "../common/queue/queue.module";
import { NotificationsService } from "./notifications.service";
import { fetchExpoReceipts, isDeviceGone, RECEIPT_CHECK_DELAY_MS, sendExpoPush, type ExpoMessage } from "./expo-push";

/** Job on the push-check queue that looks up Expo delivery receipts for tickets sent earlier. */
export const EXPO_RECEIPTS_JOB = "expo-receipts";
/** The Android notification channel Cantero Field creates at startup (apps/mobile). */
export const ANDROID_CHANNEL_ID = "alerts";

export interface ReceiptCheck {
  ticketId: string;
  tokenId: string;
}

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

  /** Registers (or refreshes) a phone's Expo push token for the signed-in member. A token already
   * held by another membership moves over — the phone now belongs to whoever signed in on it. */
  async registerDevice(companyId: string, userId: string, input: RegisterDeviceInput) {
    const membership = await this.prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId, companyId } } });
    await this.prisma.devicePushToken.upsert({
      where: { token: input.token },
      create: { membershipId: membership.id, token: input.token, platform: input.platform },
      update: { membershipId: membership.id, platform: input.platform, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  /** Called on sign-out, so a shared phone stops getting the previous worker's alerts. */
  async unregisterDevice(companyId: string, userId: string, token: string) {
    const membership = await this.prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId, companyId } } });
    await this.prisma.devicePushToken.deleteMany({ where: { token, membershipId: membership.id } });
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
      where: { OR: [{ pushSubscriptions: { some: {} } }, { devicePushTokens: { some: {} } }] },
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
    await Promise.all([...subs.map((sub) => this.sendToSubscription(sub, payload)), this.sendToDevices(membershipId, payload)]);
  }

  /** The same alert to the member's phones through Expo Push. A token Expo says is gone is deleted
   * straight away; the rest are checked again against their delivery receipts later, since APNs/FCM
   * report an uninstalled app only then. */
  private async sendToDevices(membershipId: string, payload: PushPayload) {
    const devices = await this.prisma.devicePushToken.findMany({ where: { membershipId } });
    if (devices.length === 0) return;
    const projectId = /^\/projects\/([0-9a-f-]{36})/i.exec(payload.url)?.[1];
    const messages: ExpoMessage[] = devices.map((d) => ({
      to: d.token,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url, ...(payload.type ? { type: payload.type } : {}), ...(projectId ? { projectId } : {}) },
      sound: "default",
      priority: payload.severity === "critical" ? "high" : "default",
      channelId: ANDROID_CHANNEL_ID,
    }));
    let tickets;
    try {
      tickets = await sendExpoPush(messages, this.config.get<string>("EXPO_ACCESS_TOKEN") || undefined);
    } catch (err) {
      this.logger.warn(`Expo push send failed for membership ${membershipId}: ${(err as Error).message}`);
      return;
    }
    const gone: string[] = [];
    const checks: ReceiptCheck[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === "ok") checks.push({ ticketId: ticket.id, tokenId: devices[i].id });
      else if (isDeviceGone(ticket)) gone.push(devices[i].id);
      else this.logger.warn(`Expo push rejected a message to device ${devices[i].id}: ${ticket.message}`);
    });
    if (gone.length > 0) await this.prisma.devicePushToken.deleteMany({ where: { id: { in: gone } } });
    if (checks.length > 0) await this.queue.add(EXPO_RECEIPTS_JOB, { checks }, { delay: RECEIPT_CHECK_DELAY_MS, removeOnComplete: true, removeOnFail: 100 });
  }

  /** Runs RECEIPT_CHECK_DELAY_MS after a send: drops tokens whose delivery came back DeviceNotRegistered. */
  async checkReceipts(checks: ReceiptCheck[]) {
    const receipts = await fetchExpoReceipts(
      checks.map((c) => c.ticketId),
      this.config.get<string>("EXPO_ACCESS_TOKEN") || undefined,
    );
    const gone = checks.filter((c) => receipts[c.ticketId] && isDeviceGone(receipts[c.ticketId])).map((c) => c.tokenId);
    if (gone.length > 0) await this.prisma.devicePushToken.deleteMany({ where: { id: { in: gone } } });
    return { removed: gone.length };
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
