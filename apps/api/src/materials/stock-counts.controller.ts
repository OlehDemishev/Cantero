import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createStockCountSchema,
  updateStockCountLineSchema,
  type AuthUser,
  type CreateStockCountInput,
  type UpdateStockCountLineInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockCountsService } from "./stock-counts.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("warehouse stock counts")
@Controller("materials/stock/counts")
export class StockCountsController {
  constructor(private readonly service: StockCountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.list(user.companyId, warehouseId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStockCountSchema)) body: CreateStockCountInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id/lines/:lineId")
  updateLine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body(new ZodValidationPipe(updateStockCountLineSchema)) body: UpdateStockCountLineInput,
  ) {
    return this.service.updateLine(user.companyId, id, lineId, body);
  }

  @Post(":id/finalize")
  finalize(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.finalize(user.companyId, id);
  }
}
