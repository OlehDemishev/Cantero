import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createCustomFieldDefinitionSchema,
  setCustomFieldValuesSchema,
  type AuthUser,
  type CreateCustomFieldDefinitionInput,
  type CustomFieldEntityType,
  type SetCustomFieldValuesInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { CustomFieldsService } from "./custom-fields.service";

@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  @Get("definitions")
  listDefinitions(@CurrentUser() user: AuthUser, @Query("entityType") entityType?: CustomFieldEntityType) {
    return this.service.listDefinitions(user.companyId, entityType);
  }

  @Roles("owner", "admin")
  @Post("definitions")
  createDefinition(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomFieldDefinitionSchema)) body: CreateCustomFieldDefinitionInput,
  ) {
    return this.service.createDefinition(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @NotProjectScoped("field definitions are company-wide")
  @Delete("definitions/:id")
  deleteDefinition(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteDefinition(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @NotProjectScoped("`:entityId` is a project or a client; the service checks project access when it's a project")
  @Get(":entityType/:entityId")
  getValues(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: CustomFieldEntityType,
    @Param("entityId") entityId: string,
  ) {
    return this.service.getValues(user.companyId, entityType, entityId, user);
  }

  @NotProjectScoped("`:entityId` is a project or a client; the service checks project access when it's a project")
  @Patch(":entityType/:entityId")
  setValues(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: CustomFieldEntityType,
    @Param("entityId") entityId: string,
    @Body(new ZodValidationPipe(setCustomFieldValuesSchema)) body: SetCustomFieldValuesInput,
  ) {
    return this.service.setValues(user.companyId, entityType, entityId, body, user);
  }
}
