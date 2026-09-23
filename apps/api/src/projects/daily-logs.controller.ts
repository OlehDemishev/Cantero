import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  createDailyLogSchema,
  updateDailyLogSchema,
  type AuthUser,
  type CreateDailyLogInput,
  type UpdateDailyLogInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DailyLogsService } from "./daily-logs.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("DailyLog")
@Requires("site.dailyLogs.create")
@Controller("daily-logs")
export class DailyLogsController {
  constructor(private readonly service: DailyLogsService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  // Declared before ":id" so "weather-delay-report" isn't swallowed as a daily-log id.
  @Requires("site.manage")
  @Get("weather-delay-report")
  weatherDelayReport(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.weatherDelayReport(user.companyId, projectId);
  }

  @Requires("site.manage")
  @Get("weather-delay-report/export")
  @Header("Content-Type", "text/csv")
  async weatherDelayReportExport(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("projectId", ParseUUIDPipe) projectId: string,
  ) {
    res.set("Content-Disposition", "attachment; filename=weather-delay-report.csv");
    return this.service.weatherDelayReportCsv(user.companyId, projectId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createDailyLogSchema)) body: CreateDailyLogInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDailyLogSchema)) body: UpdateDailyLogInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
