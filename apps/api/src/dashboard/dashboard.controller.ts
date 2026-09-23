import { Body, Controller, Delete, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import {
  createDashboardWidgetSchema,
  reorderDashboardWidgetsSchema,
  type AuthUser,
  type CreateDashboardWidgetInput,
  type ReorderDashboardWidgetsInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DashboardService } from "./dashboard.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";

@NotProjectScoped("the caller's own dashboard widgets")
@OpenToAllRoles("each member's own account, settings and workspace")
@Controller("dashboard-widgets")
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId, user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDashboardWidgetSchema)) body: CreateDashboardWidgetInput,
  ) {
    return this.service.create(user.companyId, user.userId, body);
  }

  @Post("reorder")
  reorder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reorderDashboardWidgetsSchema)) body: ReorderDashboardWidgetsInput,
  ) {
    return this.service.reorder(user.companyId, user.userId, body.orderedIds);
  }

  @Get("export.pdf")
  @Header("Content-Type", "application/pdf")
  async exportPdf(@CurrentUser() user: AuthUser) {
    const buffer = await this.service.exportPdf(user.companyId, user.userId);
    return new StreamableFile(buffer, { disposition: `attachment; filename="dashboard.pdf"` });
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, user.userId, id);
  }
}
