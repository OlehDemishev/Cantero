import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createPurchaseOrderSchema, receivePurchaseOrderSchema, type AuthUser, type CreatePurchaseOrderInput, type ReceivePurchaseOrderInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Controller("materials/purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/receive")
  receive(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(receivePurchaseOrderSchema)) body: ReceivePurchaseOrderInput,
  ) {
    return this.service.receive(user.companyId, id, body.warehouseId);
  }
}
