import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res } from "@nestjs/common";
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

@ProjectResource("DailyLog")
@Controller("daily-logs")
export class DailyLogsController {
  constructor(private readonly service: DailyLogsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  // Declared before ":id" so "weather-delay-report" isn't swallowed as a daily-log id.
  @Get("weather-delay-report")
  weatherDelayReport(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.weatherDelayReport(user.companyId, projectId);
  }

  @Get("weather-delay-report/export")
  @Header("Content-Type", "text/csv")
  async weatherDelayReportExport(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("projectId") projectId: string,
  ) {
    res.set("Content-Disposition", "attachment; filename=weather-delay-report.csv");
    return this.service.weatherDelayReportCsv(user.companyId, projectId);
  }

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
