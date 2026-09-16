import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  assembleStockKitSchema,
  createStockKitSchema,
  updateStockKitSchema,
  type AssembleStockKitInput,
  type AuthUser,
  type CreateStockKitInput,
  type UpdateStockKitInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockKitsService } from "./stock-kits.service";

@Controller("materials/stock-kits")
export class StockKitsController {
  constructor(private readonly service: StockKitsService) {}

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
    @Body(new ZodValidationPipe(createStockKitSchema)) body: CreateStockKitInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStockKitSchema)) body: UpdateStockKitInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/assemble")
  assemble(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assembleStockKitSchema)) body: AssembleStockKitInput,
  ) {
    return this.service.assemble(user.companyId, { userId: user.userId, name: user.name }, body.warehouseId, id, body.quantity);
  }

  @Post(":id/disassemble")
  disassemble(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assembleStockKitSchema)) body: AssembleStockKitInput,
  ) {
    return this.service.disassemble(user.companyId, { userId: user.userId, name: user.name }, body.warehouseId, id, body.quantity);
  }
}
