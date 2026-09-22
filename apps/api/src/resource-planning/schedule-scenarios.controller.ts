import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import {
  createScheduleScenarioSchema,
  setScenarioTaskOverrideSchema,
  type AuthUser,
  type CreateScheduleScenarioInput,
  type SetScenarioTaskOverrideInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ResourcePlanningService } from "./resource-planning.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("ScheduleScenario")
@Controller()
export class ScheduleScenariosController {
  constructor(private readonly service: ResourcePlanningService) {}

  @Get("projects/:id/schedule-scenarios")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listScenarios(user.companyId, projectId);
  }

  @Post("projects/:id/schedule-scenarios")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createScheduleScenarioSchema)) body: CreateScheduleScenarioInput,
  ) {
    return this.service.createScenario(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Delete("schedule-scenarios/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteScenario(user.companyId, id);
  }

  @Post("schedule-scenarios/:id/overrides")
  setOverride(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setScenarioTaskOverrideSchema)) body: SetScenarioTaskOverrideInput,
  ) {
    return this.service.setScenarioTaskOverride(user.companyId, id, body);
  }

  @Get("schedule-scenarios/:id/compare")
  compare(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.compareScenario(user.companyId, id);
  }
}
