import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { setMarkupRuleSchema, type AuthUser, type SetMarkupRuleInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MarkupRulesService } from "./markup-rules.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company markup rules")
@Requires("pricing.manage")
@Controller("markup-rules")
export class MarkupRulesController {
  constructor(private readonly service: MarkupRulesService) {}

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  set(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(setMarkupRuleSchema)) body: SetMarkupRuleInput) {
    return this.service.set(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
