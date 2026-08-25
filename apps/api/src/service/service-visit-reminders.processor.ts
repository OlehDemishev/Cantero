import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SERVICE_VISIT_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { ServiceVisitRemindersService } from "./service-visit-reminders.service";

@Processor(SERVICE_VISIT_REMINDERS_QUEUE)
export class ServiceVisitRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(ServiceVisitRemindersProcessor.name);

  constructor(private readonly reminders: ServiceVisitRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { notified } = await this.reminders.runDuePass();
    if (notified > 0) this.logger.log(`Sent service-visit reminders for ${notified} contract(s)`);
  }
}
