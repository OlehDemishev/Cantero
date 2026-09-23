import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  issueFromEstimateSchema,
  recordStockMovementSchema,
  setBinLocationRefSchema,
  setBinLocationSchema,
  transferStockSchema,
  type AuthUser,
  type IssueFromEstimateInput,
  type RecordStockMovementInput,
  type SetBinLocationInput,
  type SetBinLocationRefInput,
  type TransferStockInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockService } from "./stock.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("site.manage")
@Controller("materials/stock")
export class StockController {
  constructor(private readonly service: StockService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("levels")
  levels(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.listLevels(user.companyId, warehouseId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("movements")
  movements(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string, @Query("cursor") cursor?: string) {
    return this.service.listMovements(user.companyId, warehouseId, cursor);
  }

  @Requires("finance.view")
  @Get("valuation")
  valuation(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.inventoryValuation(user.companyId, warehouseId);
  }

  @Requires("finance.view")
  @Get("standard-cost-variance")
  standardCostVariance(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.service.standardCostVariance(user.companyId, warehouseId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("lots")
  lots(
    @CurrentUser() user: AuthUser,
    @Query("warehouseId") warehouseId?: string,
    @Query("materialCatalogItemId") materialCatalogItemId?: string,
  ) {
    return this.service.listLots(user.companyId, warehouseId, materialCatalogItemId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("serial-units")
  serialUnits(
    @CurrentUser() user: AuthUser,
    @Query("warehouseId") warehouseId?: string,
    @Query("materialCatalogItemId") materialCatalogItemId?: string,
  ) {
    return this.service.listSerialUnits(user.companyId, warehouseId, materialCatalogItemId);
  }

  @OpenToAllRoles("site work every member does on a project")
  @Post("movements")
  recordMovement(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recordStockMovementSchema)) body: RecordStockMovementInput,
  ) {
    return this.service.recordMovement(user.companyId, body);
  }

  @Post("transfer")
  transfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(transferStockSchema)) body: TransferStockInput,
  ) {
    return this.service.transferStock(user.companyId, body);
  }

  @Post("issue-from-estimate")
  issueFromEstimate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(issueFromEstimateSchema)) body: IssueFromEstimateInput,
  ) {
    return this.service.issueFromEstimate(user.companyId, body.estimateId, body.warehouseId);
  }

  @Post("bin-location")
  setBinLocation(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(setBinLocationSchema)) body: SetBinLocationInput) {
    return this.service.setBinLocation(user.companyId, body);
  }

  @Post("bin-location-ref")
  setBinLocationRef(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(setBinLocationRefSchema)) body: SetBinLocationRefInput) {
    return this.service.setBinLocationRef(user.companyId, body);
  }
}
