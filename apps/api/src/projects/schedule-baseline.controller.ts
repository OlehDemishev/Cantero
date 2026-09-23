import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { createScheduleBaselineSchema, type AuthUser, type CreateScheduleBaselineInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ScheduleBaselineService } from "./schedule-baseline.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("ScheduleBaseline")
@Requires("site.manage")
@Controller("schedule-baselines")
export class ScheduleBaselineController {
  constructor(private readonly service: ScheduleBaselineService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get(":id/compare")
  compare(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.compare(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Query("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createScheduleBaselineSchema)) body: CreateScheduleBaselineInput,
  ) {
    return this.service.create(user.companyId, user.name, projectId, body);
  }
}
