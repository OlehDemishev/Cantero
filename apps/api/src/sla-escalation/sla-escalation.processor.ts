import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SLA_ESCALATION_QUEUE } from "../common/queue/queue.module";
import { SlaEscalationService } from "./sla-escalation.service";

/** Fires on the repeatable schedule set up by SlaEscalationService.onModuleInit — one pass over every company with an SLA configured. */
@Processor(SLA_ESCALATION_QUEUE)
export class SlaEscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaEscalationProcessor.name);

  constructor(private readonly slaEscalation: SlaEscalationService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { escalated } = await this.slaEscalation.runDuePass();
    if (escalated > 0) this.logger.log(`Escalated ${escalated} overdue item(s)`);
  }
}
