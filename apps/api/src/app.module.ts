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
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
