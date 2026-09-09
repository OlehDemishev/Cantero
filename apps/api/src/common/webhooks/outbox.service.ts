import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { Prisma } from "@prisma/client";
import type { WebhookEvent } from "@cantero/shared";
import { OUTBOX_QUEUE } from "../queue/queue.module";

const OUTBOX_POLL_INTERVAL_MS = 5000;

/**
 * Transactional outbox write side. Call enqueue() inside the SAME prisma.$transaction() that
 * performs the triggering business write, so the two commit atomically: either both the
 * business row and the outbox row exist, or neither does. This is what makes delivery
 * crash-safe — WebhooksService.trigger()'s bare fire-and-forget call can lose an event if the
 * process dies before its async chain finishes; a committed OutboxEvent row survives that,
 * because OutboxProcessor picks up any row still "pending" on its next poll regardless of
 * whether the process that created it is still running. See AUDIT-2026-09-07.md.
 *
 * The processor is a poller (registered here as a repeatable job, same pattern as
 * RecurringInvoicesService.onModuleInit), not a job-per-row added right after commit: adding a
 * job at commit time reintroduces the exact crash gap this exists to close (commit succeeds,
 * process dies before the queue.add() line runs, nothing is ever notified) and would still need
 * a periodic sweep as a safety net — so the sweep is made the only mechanism instead of a second
 * one bolted on top.
 */
@Injectable()
export class OutboxService implements OnModuleInit {
  constructor(@InjectQueue(OUTBOX_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // Same jobId + repeat options on every boot — BullMQ dedupes rather than stacking repeats.
    await this.queue.add("poll", {}, { repeat: { every: OUTBOX_POLL_INTERVAL_MS }, jobId: "outbox-poll" });
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    companyId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: { companyId, event, payload: payload as Prisma.InputJsonValue },
    });
  }
}
