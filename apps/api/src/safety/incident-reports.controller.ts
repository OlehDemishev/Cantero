import { Controller, Get, Header, Body, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import {
  createIncidentReportSchema,
  updateIncidentReportSchema,
  type AuthUser,
  type CreateIncidentReportInput,
  type UpdateIncidentReportInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { IncidentReportsService } from "./incident-reports.service";

@Controller("safety/incidents")
export class IncidentReportsController {
  constructor(private readonly service: IncidentReportsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  // Declared before ":id" so "export" isn't swallowed as an incident id.
  @Get("export")
  @Header("Content-Type", "text/csv")
  export(@CurrentUser() user: AuthUser) {
    return this.service.exportCsv(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="incident-report.pdf"` });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createIncidentReportSchema)) body: CreateIncidentReportInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateIncidentReportSchema)) body: UpdateIncidentReportInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }
}
