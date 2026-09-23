import { Body, Controller, Delete, Get, Param, Patch } from "@nestjs/common";
import {
  assignCustomRoleSchema,
  updateMemberRoleSchema,
  type AssignCustomRoleInput,
  type AuthUser,
  type UpdateMemberRoleInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles, Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MembersService } from "./members.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("company members, keyed by user id")
@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Roles")
@Controller("company/members")
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Roles("owner", "admin")
  @Patch(":userId")
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    return this.service.updateRole(user.companyId, { userId: user.userId, name: user.name }, userId, body);
  }

  @Roles("owner", "admin")
  @Patch(":userId/custom-role")
  assignCustomRole(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(assignCustomRoleSchema)) body: AssignCustomRoleInput,
  ) {
    return this.service.assignCustomRole(user.companyId, { userId: user.userId, name: user.name }, userId, body);
  }

  @Roles("owner", "admin")
  @Delete(":userId")
  remove(@CurrentUser() user: AuthUser, @Param("userId") userId: string) {
    return this.service.remove(user.companyId, { userId: user.userId, name: user.name }, userId);
  }
}
