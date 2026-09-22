import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createPurchaseOrderSchema,
  receivePurchaseOrderSchema,
  receiveShipmentSchema,
  resolveReceivingDiscrepancySchema,
  type AuthUser,
  type CreatePurchaseOrderInput,
  type ReceivePurchaseOrderInput,
  type ReceiveShipmentInput,
  type ResolveReceivingDiscrepancyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

const PURCHASE_ORDERS_PAGE_SIZE = 100;

@NotProjectScoped("purchase orders have no project link in the schema")
@Controller("materials/purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("supplierId") supplierId?: string, @Query("cursor") cursor?: string) {
    return this.service.list(user.companyId, supplierId, PURCHASE_ORDERS_PAGE_SIZE, cursor);
  }

  @Get("receiving-discrepancies")
  listDiscrepancies(@CurrentUser() user: AuthUser, @Query("purchaseOrderId") purchaseOrderId?: string) {
    return this.service.listDiscrepancies(user.companyId, purchaseOrderId);
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

  @Post(":id/receive-shipment")
  receiveShipment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(receiveShipmentSchema)) body: ReceiveShipmentInput,
  ) {
    return this.service.receiveShipment(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("receiving-discrepancies/:id/resolve")
  resolveDiscrepancy(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveReceivingDiscrepancySchema)) body: ResolveReceivingDiscrepancyInput,
  ) {
    return this.service.resolveDiscrepancy(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
