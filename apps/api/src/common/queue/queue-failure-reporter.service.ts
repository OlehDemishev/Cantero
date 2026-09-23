import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import * as Sentry from "@sentry/node";
import { QUEUE_NAMES } from "./queue.module";

/**
 * Every `@Processor` in this app (recurring invoices, reminders, low-stock alerts, maintenance
 * flags, ...) previously had zero failure reporting: a thrown error inside a job handler just
 * left that job marked "failed" in Redis, with nothing surfacing to a human anywhere. One
 * BullMQ `QueueEvents` listener per queue, attached centrally here instead of 14 individual
 * try/catch blocks copy-pasted into each processor, reports every job failure to Sentry.
 * Every queue in QUEUE_NAMES (queue.module.ts) is covered — the same list the queues are
 * registered from, so none can be left out.
 */
@Injectable()
export class QueueFailureReporterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueFailureReporterService.name);
  private readonly listeners: QueueEvents[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.getOrThrow<string>("REDIS_URL");
    // Read here rather than at module scope: queue.module.ts imports this service as a provider,
    // which makes this file's import of QUEUE_NAMES circular — at import time it may not exist
    // yet. By the time Nest calls onModuleInit, every module has finished loading.
    for (const queueName of QUEUE_NAMES) {
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
