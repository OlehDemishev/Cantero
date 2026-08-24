import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SCHEDULED_REPORTS_QUEUE } from "../common/queue/queue.module";
import { ScheduledReportsService } from "./scheduled-reports.service";

/** Fires on the repeatable schedule set up by ScheduledReportsService.onModuleInit — one pass over every due report across every company. */
@Processor(SCHEDULED_REPORTS_QUEUE)
export class ScheduledReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledReportsProcessor.name);

  constructor(private readonly scheduledReports: ScheduledReportsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.scheduledReports.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} scheduled report(s)`);
  }
}
