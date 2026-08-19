import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  issueFromEstimateSchema,
  recordStockMovementSchema,
  type AuthUser,
  type IssueFromEstimateInput,
  type RecordStockMovementInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockService } from "./stock.service";

@Controller("materials/stock")
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get("levels")
  levels(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.listLevels(user.companyId, warehouseId);
  }

  @Get("movements")
  movements(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.listMovements(user.companyId, warehouseId);
  }

  @Post("movements")
  recordMovement(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recordStockMovementSchema)) body: RecordStockMovementInput,
  ) {
    return this.service.recordMovement(user.companyId, body);
  }

  @Post("issue-from-estimate")
  issueFromEstimate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(issueFromEstimateSchema)) body: IssueFromEstimateInput,
  ) {
    return this.service.issueFromEstimate(user.companyId, body.estimateId, body.warehouseId);
  }
}
