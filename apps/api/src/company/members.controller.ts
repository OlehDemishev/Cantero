import { Body, Controller, Delete, Get, Param, Patch } from "@nestjs/common";
import { updateMemberRoleSchema, type AuthUser, type UpdateMemberRoleInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MembersService } from "./members.service";

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
    return this.service.updateRole(user.companyId, userId, body);
  }

  @Roles("owner", "admin")
  @Delete(":userId")
  remove(@CurrentUser() user: AuthUser, @Param("userId") userId: string) {
    return this.service.remove(user.companyId, userId);
  }
}
