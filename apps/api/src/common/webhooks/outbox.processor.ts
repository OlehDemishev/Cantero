import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { OutboxEvent } from "@prisma/client";
import type { WebhookEvent } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOX_QUEUE } from "../queue/queue.module";
import { WebhooksService } from "./webhooks.service";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;
/** Exponential backoff capped at 1h: 30s, 1m, 2m, 4m, 8m, 16m, 32m, ~1h, 1h, 1h... */
const backoffMs = (attempts: number) => Math.min(30 * 2 ** attempts, 3600) * 1000;

/** Polls for due OutboxEvent rows and delivers each to every subscribed endpoint, with per-row
 * optimistic locking (so more than one API instance can safely run this poller) and
 * per-endpoint idempotency (a retried row skips endpoints it already reached). */
@Processor(OUTBOX_QUEUE)
export class OutboxProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const batch = await this.prisma.outboxEvent.findMany({
      where: { status: "pending", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });
    for (const row of batch) await this.processOne(row);
  }

  private async processOne(row: OutboxEvent): Promise<void> {
    // Optimistic lock: only proceed if this row is still "pending" — if another worker (or a
    // concurrent poll tick) already claimed it, count will be 0 and we skip it.
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) return;

    const endpoints = await this.webhooks.findActiveEndpoints(row.companyId, row.event);
    let anyFailed = false;
    for (const endpoint of endpoints) {
      if (await this.webhooks.alreadyDelivered(row.id, endpoint.id)) continue;
      const success = await this.webhooks
        .deliverToEndpoint(endpoint, row.event, row.payload as Record<string, unknown>, row.id)
        .catch(() => false);
      if (!success) anyFailed = true;
    }

    // Chat notification only on the first attempt — it has no per-endpoint delivery record to
    // dedupe against, so retrying it on every pass would spam a duplicate Slack/Teams message
    // for every retried endpoint failure.
    if (row.attempts === 0) {
      await this.webhooks
        .notifyChat(row.companyId, row.event as WebhookEvent, row.payload as Record<string, unknown>)
        .catch(() => {});
    }

    if (anyFailed && row.attempts + 1 < MAX_ATTEMPTS) {
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: "pending",
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts + 1)),
        },
      });
    } else {
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: anyFailed ? "failed" : "delivered", deliveredAt: anyFailed ? null : new Date() },
      });
    }
  }
}
