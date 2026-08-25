import { Body, Controller, Delete, Get, Header, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  createCustomReportSchema,
  reportDefinitionSchema,
  type AuthUser,
  type CreateCustomReportInput,
  type ReportDefinitionInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CustomReportsService } from "./custom-reports.service";

@Controller("custom-reports")
export class CustomReportsController {
  constructor(private readonly service: CustomReportsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomReportSchema)) body: CreateCustomReportInput,
  ) {
    return this.service.create(user.companyId, user.userId, body);
  }

  @Post("preview")
  preview(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reportDefinitionSchema)) body: ReportDefinitionInput,
  ) {
    return this.service.preview(user.companyId, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }

  @Get(":id/run")
  run(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.run(user.companyId, id);
  }

  @Get(":id/export.csv")
  @Header("Content-Type", "text/csv")
  async exportCsv(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const csv = await this.service.exportCsv(user.companyId, id);
    res.set("Content-Disposition", 'attachment; filename="report.csv"');
    return csv;
  }
}
