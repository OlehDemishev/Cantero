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

@Module({
  controllers: [CompanyController, MembersController, InvitesController, ApiKeysController, AuditLogController],
  providers: [CompanyService, MembersService, InvitesService, ApiKeysService],
})
export class CompanyModule {}
