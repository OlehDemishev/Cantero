import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  applyChecklistTemplateSchema,
  createChecklistTemplateSchema,
  updateChecklistTemplateSchema,
  type ApplyChecklistTemplateInput,
  type AuthUser,
  type ChecklistTemplateType,
  type CreateChecklistTemplateInput,
  type UpdateChecklistTemplateInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ChecklistTemplatesService } from "./checklist-templates.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company-wide templates; applying one names the project in the body")
@Requires("templates.field")
@Controller("checklist-templates")
export class ChecklistTemplatesController {
  constructor(private readonly service: ChecklistTemplatesService) {}

  @OpenToAllRoles("every role fills in checklists and inspections built from these")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("type") type?: ChecklistTemplateType) {
    return this.service.list(user.companyId, type);
  }

  @OpenToAllRoles("every role fills in checklists and inspections built from these")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createChecklistTemplateSchema)) body: CreateChecklistTemplateInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateChecklistTemplateSchema)) body: UpdateChecklistTemplateInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @OpenToAllRoles("every role fills in checklists and inspections built from these")
  @Get(":id/history")
  history(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.history(user.companyId, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }

  @OpenToAllRoles("starting a checklist from a template on a project is site work")
  @Post(":id/apply")
  apply(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(applyChecklistTemplateSchema)) body: ApplyChecklistTemplateInput,
  ) {
    return this.service.apply(user.companyId, { userId: user.userId, name: user.name }, id, body.projectId);
  }
}
