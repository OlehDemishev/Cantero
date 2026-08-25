import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { INVOICE_REMINDERS_QUEUE } from "../common/queue/queue.module";
import { InvoiceRemindersService } from "./invoice-reminders.service";

/** Fires on the repeatable schedule set up by InvoiceRemindersService.onModuleInit — one pass over every company with reminders enabled. */
@Processor(INVOICE_REMINDERS_QUEUE)
export class InvoiceRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceRemindersProcessor.name);

  constructor(private readonly invoiceReminders: InvoiceRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { sent } = await this.invoiceReminders.runDuePass();
    if (sent > 0) this.logger.log(`Sent ${sent} overdue invoice reminder(s)`);
  }
}
