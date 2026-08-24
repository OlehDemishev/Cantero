import { Module } from "@nestjs/common";
import { SubcontractorPortalAuthController } from "./subcontractor-portal-auth.controller";
import { SubcontractorPortalAuthService } from "./subcontractor-portal-auth.service";
import { SubcontractorPortalJwtService } from "./subcontractor-portal-jwt.service";
import { SubcontractorPortalAuthGuard } from "./subcontractor-portal-auth.guard";
import { SubcontractorPortalController } from "./subcontractor-portal.controller";
import { SubcontractorPortalService } from "./subcontractor-portal.service";
import { BiddingModule } from "../bidding/bidding.module";

@Module({
  imports: [BiddingModule],
  controllers: [SubcontractorPortalAuthController, SubcontractorPortalController],
  providers: [
    SubcontractorPortalJwtService,
    SubcontractorPortalAuthGuard,
    SubcontractorPortalAuthService,
    SubcontractorPortalService,
  ],
})
export class SubcontractorPortalModule {}
