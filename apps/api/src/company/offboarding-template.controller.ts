import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createOffboardingTemplateItemSchema,
  updateOffboardingTemplateItemSchema,
  type AuthUser,
  type CreateOffboardingTemplateItemInput,
  type UpdateOffboardingTemplateItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { OffboardingTemplateService } from "./offboarding-template.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company offboarding checklist template")
@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Requires")
@Controller("company/offboarding-template")
export class OffboardingTemplateController {
  constructor(private readonly service: OffboardingTemplateService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Requires("templates.company")
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createOffboardingTemplateItemSchema)) body: CreateOffboardingTemplateItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Requires("templates.company")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOffboardingTemplateItemSchema)) body: UpdateOffboardingTemplateItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Requires("templates.company")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
