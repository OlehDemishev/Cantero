import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createScheduledReportSchema,
  updateScheduledReportSchema,
  type AuthUser,
  type CreateScheduledReportInput,
  type UpdateScheduledReportInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ScheduledReportsService } from "./scheduled-reports.service";

@Controller("scheduled-reports")
export class ScheduledReportsController {
  constructor(private readonly service: ScheduledReportsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createScheduledReportSchema)) body: CreateScheduledReportInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateScheduledReportSchema)) body: UpdateScheduledReportInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }

  @Post(":id/send-now")
  sendNow(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.sendNow(user.companyId, id);
  }
}
