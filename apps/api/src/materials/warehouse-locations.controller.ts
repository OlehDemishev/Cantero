import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  createWarehouseLocationSchema,
  type AuthUser,
  type CreateWarehouseLocationInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WarehouseLocationsService } from "./warehouse-locations.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("warehouse bin locations")
@Requires("templates.company")
@Controller("materials/warehouse-locations")
export class WarehouseLocationsController {
  constructor(private readonly service: WarehouseLocationsService) {}

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId: string) {
    return this.service.list(user.companyId, warehouseId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWarehouseLocationSchema)) body: CreateWarehouseLocationInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
