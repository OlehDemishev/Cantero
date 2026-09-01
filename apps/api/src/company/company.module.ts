import { Module } from "@nestjs/common";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { AuditLogController } from "./audit-log.controller";
import { WebhooksController } from "./webhooks.controller";
import { DataExportController } from "./data-export.controller";
import { DataExportService } from "./data-export.service";
import { CustomRolesController } from "./custom-roles.controller";
import { CustomRolesService } from "./custom-roles.service";
import { OnboardingTemplateController } from "./onboarding-template.controller";
import { OnboardingTemplateService } from "./onboarding-template.service";
import { CompanyCoiController } from "./company-coi.controller";
import { PublicCompanyCoiController } from "./public-company-coi.controller";
import { CompanyCoiService } from "./company-coi.service";
import { PublicPortalBrandingController } from "./public-portal-branding.controller";
import { CompanyHolidaysController } from "./company-holidays.controller";
import { CompanyHolidaysService } from "./company-holidays.service";

@Module({
  controllers: [
    CompanyController,
    MembersController,
    InvitesController,
    ApiKeysController,
    AuditLogController,
    WebhooksController,
    DataExportController,
    CustomRolesController,
    OnboardingTemplateController,
    CompanyCoiController,
    PublicCompanyCoiController,
    PublicPortalBrandingController,
    CompanyHolidaysController,
  ],
  providers: [
    CompanyService,
    MembersService,
    InvitesService,
    ApiKeysService,
    DataExportService,
    CustomRolesService,
    OnboardingTemplateService,
    CompanyCoiService,
    CompanyHolidaysService,
  ],
})
export class CompanyModule {}
