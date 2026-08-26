import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ESTIMATE_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { EstimateRemindersService } from "./estimate-reminders.service";

/** Fires on the repeatable schedule set up by EstimateRemindersService.onModuleInit — one pass over every company with estimate reminders enabled. */
@Processor(ESTIMATE_REMINDERS_QUEUE)
export class EstimateRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(EstimateRemindersProcessor.name);

  constructor(private readonly estimateReminders: EstimateRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.estimateReminders.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} estimate reminder(s)`);
  }
}
