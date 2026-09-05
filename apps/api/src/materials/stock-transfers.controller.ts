import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { initiateStockTransferSchema, type AuthUser, type InitiateStockTransferInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockTransfersService } from "./stock-transfers.service";

@Controller("materials/stock-transfers")
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.list(user.companyId, warehouseId);
  }

  @Post()
  initiate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(initiateStockTransferSchema)) body: InitiateStockTransferInput,
  ) {
    return this.service.initiate(user.companyId, user.name, body);
  }

  @Post(":id/receive")
  receive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.receive(user.companyId, user.name, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.cancel(user.companyId, id);
  }
}
