import { Module } from "@nestjs/common";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";

@Module({
  controllers: [CompanyController, MembersController, InvitesController],
  providers: [CompanyService, MembersService, InvitesService],
})
export class CompanyModule {}
