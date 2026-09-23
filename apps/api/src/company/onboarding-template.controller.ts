import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createOnboardingTemplateItemSchema,
  updateOnboardingTemplateItemSchema,
  type AuthUser,
  type CreateOnboardingTemplateItemInput,
  type UpdateOnboardingTemplateItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { OnboardingTemplateService } from "./onboarding-template.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company onboarding checklist template")
@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Requires")
@Controller("company/onboarding-template")
export class OnboardingTemplateController {
  constructor(private readonly service: OnboardingTemplateService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Requires("templates.company")
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createOnboardingTemplateItemSchema)) body: CreateOnboardingTemplateItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Requires("templates.company")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOnboardingTemplateItemSchema)) body: UpdateOnboardingTemplateItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Requires("templates.company")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
