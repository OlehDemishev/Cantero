import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { PermissionsModule } from "./common/permissions/permissions.module";
import { WorkerFieldsInterceptor } from "./common/permissions/worker-fields.interceptor";
import { PdfModule } from "./common/pdf/pdf.module";
import { QueueModule } from "./common/queue/queue.module";
import { StorageModule } from "./common/storage/storage.module";
import { AuditModule } from "./common/audit/audit.module";
import { GobdModule } from "./common/gobd/gobd.module";
import { IntacctModule } from "./intacct/intacct.module";
import { RateLimiterModule } from "./common/rate-limiter/rate-limiter.module";
import { MailModule } from "./common/mail/mail.module";
import { SmsModule } from "./common/sms/sms.module";
import { WebhooksModule } from "./common/webhooks/webhooks.module";
import { SessionsModule } from "./common/sessions/sessions.module";
import { ExchangeRateModule } from "./common/exchange-rate/exchange-rate.module";
import { HealthModule } from "./health/health.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { IpAllowlistGuard } from "./common/guards/ip-allowlist.guard";
import { SubscriptionGuard } from "./common/guards/subscription.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { ProjectAccessGuard } from "./common/guards/project-access.guard";
import { ProjectAccessModule } from "./common/project-access/project-access.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { IdempotencyInterceptor } from "./common/idempotency/idempotency.interceptor";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { MeModule } from "./me/me.module";
import { CompanyModule } from "./company/company.module";
import { MaterialsModule } from "./materials/materials.module";
import { EstimatesModule } from "./estimates/estimates.module";
import { ProjectsModule } from "./projects/projects.module";
import { SmsWebhooksModule } from "./sms-webhooks/sms-webhooks.module";
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
import { SupplierPortalModule } from "./supplier-portal/supplier-portal.module";
import { SignatureRequestsModule } from "./signature-requests/signature-requests.module";
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
import { CertifiedPayrollModule } from "./certified-payroll/certified-payroll.module";
import { DrawingsModule } from "./drawings/drawings.module";
import { PermitsModule } from "./permits/permits.module";
import { EstimateAccuracyModule } from "./estimate-accuracy/estimate-accuracy.module";
import { SustainabilityModule } from "./sustainability/sustainability.module";
import { ChangeOrderRemindersModule } from "./change-order-reminders/change-order-reminders.module";
import { MessageTemplatesModule } from "./message-templates/message-templates.module";
import { SuretyBondsModule } from "./surety-bonds/surety-bonds.module";
import { ContractClaimsModule } from "./contract-claims/contract-claims.module";
import { RecruitingModule } from "./recruiting/recruiting.module";
import { PerformanceModule } from "./performance/performance.module";
import { MarketingModule } from "./marketing/marketing.module";
import { SupportTicketsModule } from "./support-tickets/support-tickets.module";
import { HrCasesModule } from "./hr-cases/hr-cases.module";
import { LoansModule } from "./loans/loans.module";
import { FleetModule } from "./fleet/fleet.module";
import { TaxModule } from "./tax/tax.module";
import { BenefitsModule } from "./benefits/benefits.module";
import { WarrantyRegistryModule } from "./warranty-registry/warranty-registry.module";
import { HazmatModule } from "./hazmat/hazmat.module";
import { LienComplianceModule } from "./lien-compliance/lien-compliance.module";
import { ToolCribModule } from "./tool-crib/tool-crib.module";
import { EnvironmentalModule } from "./environmental/environmental.module";
import { CommissioningModule } from "./commissioning/commissioning.module";
import { ProgressTrackingModule } from "./progress-tracking/progress-tracking.module";
import { TransmittalsModule } from "./transmittals/transmittals.module";
import { ConcreteQcModule } from "./concrete-qc/concrete-qc.module";
import { CalibrationModule } from "./calibration/calibration.module";
import { SubcontractorPrequalificationModule } from "./subcontractor-prequalification/subcontractor-prequalification.module";
import { AllowancesModule } from "./allowances/allowances.module";
import { UnitPriceTmModule } from "./unit-price-tm/unit-price-tm.module";
import { ProductivityModule } from "./productivity/productivity.module";
import { SubcontractorClaimsModule } from "./subcontractor-claims/subcontractor-claims.module";
import { ClientChangeRequestsModule } from "./client-change-requests/client-change-requests.module";

@Module({
  imports: [
    PermissionsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    PdfModule,
    QueueModule,
    StorageModule,
    AuditModule,
    GobdModule,
    IntacctModule,
    RateLimiterModule,
    ProjectAccessModule,
    IdempotencyModule,
    HealthModule,
    MailModule,
    SmsModule,
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
    SmsWebhooksModule,
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
    SupplierPortalModule,
    SignatureRequestsModule,
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
    ChangeOrderRemindersModule,
    MessageTemplatesModule,
    CostCodesModule,
    JobCostingModule,
    ScimModule,
    CertifiedPayrollModule,
    DrawingsModule,
    PermitsModule,
    EstimateAccuracyModule,
    SustainabilityModule,
    SuretyBondsModule,
    ContractClaimsModule,
    RecruitingModule,
    PerformanceModule,
    MarketingModule,
    SupportTicketsModule,
    HrCasesModule,
    LoansModule,
    FleetModule,
    TaxModule,
    BenefitsModule,
    WarrantyRegistryModule,
    HazmatModule,
    LienComplianceModule,
    ToolCribModule,
    EnvironmentalModule,
    CommissioningModule,
    ProgressTrackingModule,
    TransmittalsModule,
    ConcreteQcModule,
    CalibrationModule,
    SubcontractorPrequalificationModule,
    AllowancesModule,
    UnitPriceTmModule,
    ProductivityModule,
    SubcontractorClaimsModule,
    ClientChangeRequestsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: IpAllowlistGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: ProjectAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: WorkerFieldsInterceptor },
  ],
})
export class AppModule {}
