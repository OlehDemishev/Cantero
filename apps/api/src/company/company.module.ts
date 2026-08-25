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
  ],
  providers: [CompanyService, MembersService, InvitesService, ApiKeysService, DataExportService, CustomRolesService],
})
export class CompanyModule {}
