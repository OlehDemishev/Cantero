import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { STOCK_LOT_EXPIRING_QUEUE } from "../common/queue/queue.module";
import { LotExpiringRemindersService } from "./lot-expiring-reminders.service";

@Processor(STOCK_LOT_EXPIRING_QUEUE)
export class LotExpiringRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(LotExpiringRemindersProcessor.name);

  constructor(private readonly reminders: LotExpiringRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { notified } = await this.reminders.runDuePass();
    if (notified > 0) this.logger.log(`Sent lot-expiring reminders for ${notified} stock lot(s)`);
  }
}
