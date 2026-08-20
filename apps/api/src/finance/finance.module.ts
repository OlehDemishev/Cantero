import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { SubcontractorsController } from "./subcontractors.controller";
import { SubcontractorsService } from "./subcontractors.service";
import { SubcontractorCostsController } from "./subcontractor-costs.controller";
import { SubcontractorCostsService } from "./subcontractor-costs.service";
import { CashFlowController } from "./cash-flow.controller";
import { CashFlowService } from "./cash-flow.service";
import { RecurringInvoicesController } from "./recurring-invoices.controller";
import { RecurringInvoicesService } from "./recurring-invoices.service";
import { RecurringInvoicesProcessor } from "./recurring-invoices.processor";

@Module({
  controllers: [
    InvoicesController,
    BudgetController,
    SubcontractorsController,
    SubcontractorCostsController,
    CashFlowController,
    RecurringInvoicesController,
  ],
  providers: [
    InvoicesService,
    BudgetService,
    SubcontractorsService,
    SubcontractorCostsService,
    CashFlowService,
    RecurringInvoicesService,
    RecurringInvoicesProcessor,
  ],
  exports: [InvoicesService],
})
export class FinanceModule {}
