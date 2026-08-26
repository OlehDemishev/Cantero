import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { LEAD_FOLLOW_UP_QUEUE } from "../common/queue/queue.module";
import { LeadFollowUpService } from "./lead-follow-up.service";

/** Fires on the repeatable schedule set up by LeadFollowUpService.onModuleInit — one pass over every company with lead follow-up enabled. */
@Processor(LEAD_FOLLOW_UP_QUEUE)
export class LeadFollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadFollowUpProcessor.name);

  constructor(private readonly leadFollowUp: LeadFollowUpService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.leadFollowUp.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} lead follow-up email(s)`);
  }
}
