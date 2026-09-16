import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { createStockReservationSchema, type AuthUser, type CreateStockReservationInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockReservationsService } from "./stock-reservations.service";

@Controller("materials/stock-reservations")
export class StockReservationsController {
  constructor(private readonly service: StockReservationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("warehouseId") warehouseId?: string,
    @Query("materialCatalogItemId") materialCatalogItemId?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.service.list(user.companyId, warehouseId, materialCatalogItemId, cursor);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStockReservationSchema)) body: CreateStockReservationInput,
  ) {
    return this.service.create(user.companyId, user.name, body);
  }

  @Post(":id/release")
  release(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.release(user.companyId, id);
  }
}
