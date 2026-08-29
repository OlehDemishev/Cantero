import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PERMIT_EXPIRING_QUEUE } from "../common/queue/queue.module";
import { PermitExpiringRemindersService } from "./permit-expiring-reminders.service";

@Processor(PERMIT_EXPIRING_QUEUE)
export class PermitExpiringRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(PermitExpiringRemindersProcessor.name);

  constructor(private readonly reminders: PermitExpiringRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { notified } = await this.reminders.runDuePass();
    if (notified > 0) this.logger.log(`Sent permit-expiring reminders for ${notified} permit(s)`);
  }
}
