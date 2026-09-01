import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { CHANGE_ORDER_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { ChangeOrderRemindersService } from "./change-order-reminders.service";

/** Fires on the repeatable schedule set up by ChangeOrderRemindersService.onModuleInit — one pass over every company with change-order reminders enabled. */
@Processor(CHANGE_ORDER_REMINDERS_QUEUE)
export class ChangeOrderRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(ChangeOrderRemindersProcessor.name);

  constructor(private readonly changeOrderReminders: ChangeOrderRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.changeOrderReminders.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} change order reminder(s)`);
  }
}
