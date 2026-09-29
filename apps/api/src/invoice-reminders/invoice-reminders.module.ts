import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceRemindersProcessor } from "./invoice-reminders.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  imports: [FinanceModule],
  providers: [InvoiceRemindersService, ...backgroundProviders(InvoiceRemindersProcessor)],
})
export class InvoiceRemindersModule {}
