import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { SubcontractorsController } from "./subcontractors.controller";
import { SubcontractorsService } from "./subcontractors.service";
import { SubcontractorCostsController } from "./subcontractor-costs.controller";
import { SubcontractorCostsService } from "./subcontractor-costs.service";
import { RecurringInvoicesController } from "./recurring-invoices.controller";
import { RecurringInvoicesService } from "./recurring-invoices.service";
import { RecurringInvoicesProcessor } from "./recurring-invoices.processor";
import { AiaBillingService } from "./aia-billing.service";
import { PublicSubcontractorsController } from "./public-subcontractors.controller";
import { DrawRequestsController } from "./draw-requests.controller";
import { DrawRequestsService } from "./draw-requests.service";

@Module({
  controllers: [
    InvoicesController,
    BudgetController,
    SubcontractorsController,
    PublicSubcontractorsController,
    SubcontractorCostsController,
    RecurringInvoicesController,
    DrawRequestsController,
  ],
  providers: [
    InvoicesService,
    BudgetService,
    SubcontractorsService,
    SubcontractorCostsService,
    RecurringInvoicesService,
    RecurringInvoicesProcessor,
    AiaBillingService,
    DrawRequestsService,
  ],
  exports: [InvoicesService, SubcontractorsService, BudgetService],
})
export class FinanceModule {}
