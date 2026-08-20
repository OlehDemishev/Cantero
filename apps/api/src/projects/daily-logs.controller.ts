import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
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

@Controller("daily-logs")
export class DailyLogsController {
  constructor(private readonly service: DailyLogsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
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
