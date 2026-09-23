import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createWarehouseSchema, type AuthUser, type CreateWarehouseInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WarehousesService } from "./warehouses.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company warehouses")
@Requires("templates.company")
@Controller("materials/warehouses")
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @OpenToAllRoles("reference data every role estimates or works from")
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
