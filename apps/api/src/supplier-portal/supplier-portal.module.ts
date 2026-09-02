import { Module } from "@nestjs/common";
import { SupplierPortalAuthController } from "./supplier-portal-auth.controller";
import { SupplierPortalAuthService } from "./supplier-portal-auth.service";
import { SupplierPortalJwtService } from "./supplier-portal-jwt.service";
import { SupplierPortalAuthGuard } from "./supplier-portal-auth.guard";
import { SupplierPortalController } from "./supplier-portal.controller";
import { SupplierPortalService } from "./supplier-portal.service";

@Module({
  controllers: [SupplierPortalAuthController, SupplierPortalController],
  providers: [SupplierPortalJwtService, SupplierPortalAuthGuard, SupplierPortalAuthService, SupplierPortalService],
})
export class SupplierPortalModule {}
