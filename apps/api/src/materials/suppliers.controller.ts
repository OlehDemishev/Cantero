import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createSupplierSchema, type AuthUser, type CreateSupplierInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";

@Controller("materials/suppliers")
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

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
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
