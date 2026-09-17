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
import { ClientPaymentMethodsService } from "./client-payment-methods.service";
import { PeppolAccessPointService } from "./peppol-access-point.service";
import { IncomingEInvoicesController } from "./incoming-e-invoices.controller";
import { IncomingEInvoicesService } from "./incoming-e-invoices.service";
import { SubcontractorPrequalificationModule } from "../subcontractor-prequalification/subcontractor-prequalification.module";

@Module({
  imports: [SubcontractorPrequalificationModule],
  controllers: [
    InvoicesController,
    BudgetController,
    SubcontractorsController,
    PublicSubcontractorsController,
    SubcontractorCostsController,
    RecurringInvoicesController,
    DrawRequestsController,
    IncomingEInvoicesController,
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
    ClientPaymentMethodsService,
    PeppolAccessPointService,
    IncomingEInvoicesService,
  ],
  exports: [InvoicesService, SubcontractorsService, BudgetService, ClientPaymentMethodsService],
})
export class FinanceModule {}
