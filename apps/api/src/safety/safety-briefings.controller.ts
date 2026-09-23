import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  createSafetyBriefingSchema,
  updateSafetyBriefingSchema,
  type AuthUser,
  type CreateSafetyBriefingInput,
  type UpdateSafetyBriefingInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SafetyBriefingsService } from "./safety-briefings.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("SafetyBriefing")
@Requires("site.manage")
@Controller("safety/briefings")
export class SafetyBriefingsController {
  constructor(private readonly service: SafetyBriefingsService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSafetyBriefingSchema)) body: CreateSafetyBriefingInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSafetyBriefingSchema)) body: UpdateSafetyBriefingInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }
}
