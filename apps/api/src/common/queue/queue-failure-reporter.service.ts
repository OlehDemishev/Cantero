import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import * as Sentry from "@sentry/node";
import {
  STOCK_ALERTS_QUEUE,
  PUSH_CHECK_QUEUE,
  RECURRING_INVOICES_QUEUE,
  SCHEDULED_REPORTS_QUEUE,
  SLA_ESCALATION_QUEUE,
  EQUIPMENT_MAINTENANCE_QUEUE,
  NOTIFICATION_DIGEST_QUEUE,
  INVOICE_REMINDERS_QUEUE,
  SERVICE_VISIT_REMINDERS_QUEUE,
  LEAD_FOLLOW_UP_QUEUE,
  ESTIMATE_REMINDERS_QUEUE,
  PERMIT_EXPIRING_QUEUE,
  CHANGE_ORDER_REMINDERS_QUEUE,
  ENPS_SURVEYS_QUEUE,
  OUTBOX_QUEUE,
  DRAWING_SETS_QUEUE,
} from "./queue.module";

/**
 * Every `@Processor` in this app (recurring invoices, reminders, low-stock alerts, maintenance
 * flags, ...) previously had zero failure reporting: a thrown error inside a job handler just
 * left that job marked "failed" in Redis, with nothing surfacing to a human anywhere. One
 * BullMQ `QueueEvents` listener per queue, attached centrally here instead of 14 individual
 * try/catch blocks copy-pasted into each processor, reports every job failure to Sentry.
 * NOTE: this does NOT happen automatically — a queue registered in queue.module.ts still has to
 * be added to the allQueueNames list below by hand, or its failures go unreported silently.
 */
@Injectable()
export class QueueFailureReporterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueFailureReporterService.name);
  private readonly listeners: QueueEvents[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.getOrThrow<string>("REDIS_URL");
    // Built here rather than at module scope: queue.module.ts imports this service as a provider,
    // which makes this file's own import of the *_QUEUE constants circular. A module-scope array
    // literal would snapshot those constants at import time — while queue.module.ts is still
    // mid-execution and hasn't reached its own `export const` lines yet — freezing in `undefined`s
    // that later crash `new QueueEvents(undefined, ...)`. Reading them here instead, inside a
    // method that only runs once Nest's bootstrap has fully resolved every module, sees their
    // real values.
    const allQueueNames = [
      STOCK_ALERTS_QUEUE,
      PUSH_CHECK_QUEUE,
      RECURRING_INVOICES_QUEUE,
      SCHEDULED_REPORTS_QUEUE,
      SLA_ESCALATION_QUEUE,
      EQUIPMENT_MAINTENANCE_QUEUE,
      NOTIFICATION_DIGEST_QUEUE,
      INVOICE_REMINDERS_QUEUE,
      SERVICE_VISIT_REMINDERS_QUEUE,
      LEAD_FOLLOW_UP_QUEUE,
      ESTIMATE_REMINDERS_QUEUE,
      PERMIT_EXPIRING_QUEUE,
      CHANGE_ORDER_REMINDERS_QUEUE,
      ENPS_SURVEYS_QUEUE,
      OUTBOX_QUEUE,
      DRAWING_SETS_QUEUE,
    ];
    for (const queueName of allQueueNames) {
      const events = new QueueEvents(queueName, {
        connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }),
      });
      events.on("failed", ({ jobId, failedReason }) => {
        this.logger.error(`Job ${jobId} on queue "${queueName}" failed: ${failedReason}`);
        Sentry.captureException(new Error(`Queue "${queueName}" job ${jobId} failed: ${failedReason}`), {
          tags: { queue: queueName, jobId },
        });
      });
      this.listeners.push(events);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.listeners.map((listener) => listener.close()));
  }
}
