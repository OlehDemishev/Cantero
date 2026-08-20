import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { RECURRING_INVOICES_QUEUE } from "../common/queue/queue.module";
import { RecurringInvoicesService } from "./recurring-invoices.service";

/** Fires on the repeatable schedule set up by RecurringInvoicesService.onModuleInit — one pass over every due template across every company. */
@Processor(RECURRING_INVOICES_QUEUE)
export class RecurringInvoicesProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringInvoicesProcessor.name);

  constructor(private readonly recurringInvoices: RecurringInvoicesService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { generated } = await this.recurringInvoices.runDuePass();
    if (generated > 0) this.logger.log(`Generated ${generated} recurring invoice(s)`);
  }
}
