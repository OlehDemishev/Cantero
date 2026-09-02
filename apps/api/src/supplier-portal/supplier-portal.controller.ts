import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { acknowledgePurchaseOrderSchema, type AcknowledgePurchaseOrderInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SupplierPortalAuthGuard } from "./supplier-portal-auth.guard";
import { CurrentPortalSupplier } from "./current-portal-supplier.decorator";
import type { PortalSupplierContext } from "./supplier-portal-jwt.service";
import { SupplierPortalService } from "./supplier-portal.service";

/** @Public() bypasses the internal-user JwtAuthGuard chain; SupplierPortalAuthGuard independently
 * requires a valid supplier-portal token — same pattern as SubcontractorPortalController. */
@Public()
@UseGuards(SupplierPortalAuthGuard)
@Controller("supplier-portal")
export class SupplierPortalController {
  constructor(private readonly service: SupplierPortalService) {}

  @Get("me")
  me(@CurrentPortalSupplier() supplier: PortalSupplierContext) {
    return this.service.me(supplier);
  }

  @Get("purchase-orders")
  listPurchaseOrders(@CurrentPortalSupplier() supplier: PortalSupplierContext) {
    return this.service.listPurchaseOrders(supplier);
  }

  @Get("purchase-orders/:id")
  getPurchaseOrder(@CurrentPortalSupplier() supplier: PortalSupplierContext, @Param("id") id: string) {
    return this.service.getPurchaseOrder(supplier, id);
  }

  @Post("purchase-orders/:id/acknowledge")
  acknowledge(
    @CurrentPortalSupplier() supplier: PortalSupplierContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(acknowledgePurchaseOrderSchema)) body: AcknowledgePurchaseOrderInput,
  ) {
    return this.service.acknowledge(supplier, id, body);
  }
}
