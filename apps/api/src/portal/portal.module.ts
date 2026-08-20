import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { FinanceModule } from "../finance/finance.module";
import { PortalAuthController } from "./portal-auth.controller";
import { PortalAuthService } from "./portal-auth.service";
import { PortalJwtService } from "./portal-jwt.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";

@Module({
  imports: [EstimatesModule, FinanceModule],
  controllers: [PortalAuthController, PortalController],
  providers: [PortalJwtService, PortalAuthGuard, PortalAuthService, PortalService],
})
export class PortalModule {}
