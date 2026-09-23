import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createCustomRoleSchema, type AuthUser, type CreateCustomRoleInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CustomRolesService } from "./custom-roles.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company custom roles")
@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Requires")
@Controller("company/custom-roles")
export class CustomRolesController {
  constructor(private readonly service: CustomRolesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Requires("settings.roles")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomRoleSchema)) body: CreateCustomRoleInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name, role: user.role }, body);
  }

  @Requires("settings.roles")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name, role: user.role }, id);
  }
}
