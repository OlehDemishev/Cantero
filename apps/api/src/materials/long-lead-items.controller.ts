import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  createLongLeadItemSchema,
  updateLongLeadItemSchema,
  type AuthUser,
  type CreateLongLeadItemInput,
  type UpdateLongLeadItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LongLeadItemsService } from "./long-lead-items.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("LongLeadItem")
@Requires("site.manage")
@Controller("long-lead-items")
export class LongLeadItemsController {
  constructor(private readonly service: LongLeadItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createLongLeadItemSchema)) body: CreateLongLeadItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLongLeadItemSchema)) body: UpdateLongLeadItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
