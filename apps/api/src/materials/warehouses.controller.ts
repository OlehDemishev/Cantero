import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createWarehouseSchema, type AuthUser, type CreateWarehouseInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WarehousesService } from "./warehouses.service";

@Controller("materials/warehouses")
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

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
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
