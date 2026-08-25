import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { NOTIFICATION_DIGEST_QUEUE } from "../common/queue/queue.module";
import { NotificationDigestService } from "./notification-digest.service";

/** Fires on the repeatable schedule set up by NotificationDigestService.onModuleInit — one pass over every member with a digest frequency set. */
@Processor(NOTIFICATION_DIGEST_QUEUE)
export class NotificationDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDigestProcessor.name);

  constructor(private readonly digest: NotificationDigestService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.digest.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} notification digest email(s)`);
  }
}
