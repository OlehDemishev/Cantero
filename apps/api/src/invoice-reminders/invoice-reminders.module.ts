import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceRemindersProcessor } from "./invoice-reminders.processor";

@Module({
  imports: [FinanceModule],
  providers: [InvoiceRemindersService, InvoiceRemindersProcessor],
})
export class InvoiceRemindersModule {}
