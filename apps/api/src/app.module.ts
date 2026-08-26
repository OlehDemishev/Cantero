import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { PdfModule } from "./common/pdf/pdf.module";
import { QueueModule } from "./common/queue/queue.module";
import { StorageModule } from "./common/storage/storage.module";
import { AuditModule } from "./common/audit/audit.module";
import { MailModule } from "./common/mail/mail.module";
import { WebhooksModule } from "./common/webhooks/webhooks.module";
import { SessionsModule } from "./common/sessions/sessions.module";
import { ExchangeRateModule } from "./common/exchange-rate/exchange-rate.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { IpAllowlistGuard } from "./common/guards/ip-allowlist.guard";
import { SubscriptionGuard } from "./common/guards/subscription.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { MeModule } from "./me/me.module";
import { CompanyModule } from "./company/company.module";
import { MaterialsModule } from "./materials/materials.module";
import { EstimatesModule } from "./estimates/estimates.module";
import { ProjectsModule } from "./projects/projects.module";
import { CrmModule } from "./crm/crm.module";
import { FinanceModule } from "./finance/finance.module";
import { TeamModule } from "./team/team.module";
import { DocumentsModule } from "./documents/documents.module";
import { ReportsModule } from "./reports/reports.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SearchModule } from "./search/search.module";
import { PublicApiModule } from "./public-api/public-api.module";
import { PortalModule } from "./portal/portal.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { SubcontractorPortalModule } from "./subcontractor-portal/subcontractor-portal.module";
import { SafetyModule } from "./safety/safety.module";
import { CommentsModule } from "./comments/comments.module";
import { ResourcePlanningModule } from "./resource-planning/resource-planning.module";
import { ChecklistTemplatesModule } from "./checklist-templates/checklist-templates.module";
import { ScheduledReportsModule } from "./scheduled-reports/scheduled-reports.module";
import { SlaEscalationModule } from "./sla-escalation/sla-escalation.module";
import { BiddingModule } from "./bidding/bidding.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { SavedViewsModule } from "./saved-views/saved-views.module";
import { LeadsModule } from "./leads/leads.module";
import { SsoModule } from "./sso/sso.module";
import { AccountingModule } from "./accounting/accounting.module";
import { InvoiceRemindersModule } from "./invoice-reminders/invoice-reminders.module";
import { InsightsModule } from "./insights/insights.module";
import { CalendarFeedModule } from "./calendar-feed/calendar-feed.module";
import { ServiceModule } from "./service/service.module";
import { BankReconciliationModule } from "./bank-reconciliation/bank-reconciliation.module";
import { QualityModule } from "./quality/quality.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ContractsModule } from "./contracts/contracts.module";
import { LeadFollowUpModule } from "./lead-follow-up/lead-follow-up.module";
import { EstimateRemindersModule } from "./estimate-reminders/estimate-reminders.module";
import { CostCodesModule } from "./cost-codes/cost-codes.module";
import { JobCostingModule } from "./job-costing/job-costing.module";
import { ScimModule } from "./scim/scim.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PdfModule,
    QueueModule,
    StorageModule,
    AuditModule,
    MailModule,
    WebhooksModule,
    SessionsModule,
    ExchangeRateModule,
    AuthModule,
    BillingModule,
    MeModule,
    CompanyModule,
    MaterialsModule,
    EstimatesModule,
    ProjectsModule,
    CrmModule,
    FinanceModule,
    TeamModule,
    DocumentsModule,
    ReportsModule,
    NotificationsModule,
    SearchModule,
    PublicApiModule,
    PortalModule,
    EquipmentModule,
    SubcontractorPortalModule,
    SafetyModule,
    CommentsModule,
    ResourcePlanningModule,
    ChecklistTemplatesModule,
    ScheduledReportsModule,
    SlaEscalationModule,
    BiddingModule,
    CustomFieldsModule,
    SavedViewsModule,
    LeadsModule,
    SsoModule,
    AccountingModule,
    InvoiceRemindersModule,
    InsightsModule,
    CalendarFeedModule,
    ServiceModule,
    BankReconciliationModule,
    QualityModule,
    DashboardModule,
    ContractsModule,
    LeadFollowUpModule,
    EstimateRemindersModule,
    CostCodesModule,
    JobCostingModule,
    ScimModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: IpAllowlistGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
