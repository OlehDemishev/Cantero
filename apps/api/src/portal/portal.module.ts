import { Module } from "@nestjs/common";
import { EstimatesModule } from "../estimates/estimates.module";
import { FinanceModule } from "../finance/finance.module";
import { BillingModule } from "../billing/billing.module";
import { PortalAuthController } from "./portal-auth.controller";
import { PortalAuthService } from "./portal-auth.service";
import { PortalJwtService } from "./portal-jwt.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { PortalMessagesController } from "./portal-messages.controller";
import { PortalMessagesService } from "./portal-messages.service";
import { SupportTicketsModule } from "../support-tickets/support-tickets.module";

@Module({
  imports: [EstimatesModule, FinanceModule, BillingModule, SupportTicketsModule],
  controllers: [PortalAuthController, PortalController, PortalMessagesController],
  providers: [PortalJwtService, PortalAuthGuard, PortalAuthService, PortalService, PortalMessagesService],
})
export class PortalModule {}
