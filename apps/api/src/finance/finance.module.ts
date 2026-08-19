import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";

@Module({
  controllers: [InvoicesController, BudgetController],
  providers: [InvoicesService, BudgetService],
})
export class FinanceModule {}
