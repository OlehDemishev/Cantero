import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { createSupplierReturnSchema, type AuthUser, type CreateSupplierReturnInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SupplierReturnsService } from "./supplier-returns.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@NotProjectScoped("warehouse returns to suppliers")
@RequiresFor("purchasing.view", "purchasing.manage")
@Controller("materials/supplier-returns")
export class SupplierReturnsController {
  constructor(private readonly service: SupplierReturnsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("supplierId") supplierId?: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.service.list(user.companyId, supplierId, warehouseId, cursor);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupplierReturnSchema)) body: CreateSupplierReturnInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/confirm")
  confirm(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.confirm(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
