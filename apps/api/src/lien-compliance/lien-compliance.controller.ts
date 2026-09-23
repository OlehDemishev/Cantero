import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createLienNoticeSchema,
  createMechanicsLienFilingSchema,
  updateLienFilingStatusSchema,
  type AuthUser,
  type CreateLienNoticeInput,
  type CreateMechanicsLienFilingInput,
  type UpdateLienFilingStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LienComplianceService } from "./lien-compliance.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@RequiresFor("finance.view", "finance.manage")
@Controller()
export class LienComplianceController {
  constructor(private readonly service: LienComplianceService) {}

  @Get("lien-notices/upcoming")
  upcomingDeadlines(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    return this.service.upcomingDeadlines(user.companyId, days ? Number(days) : undefined);
  }

  @Get("projects/:id/lien-notices")
  listNoticesForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listNoticesForProject(user.companyId, id);
  }

  @Post("projects/:id/lien-notices")
  createNotice(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createLienNoticeSchema)) body: CreateLienNoticeInput,
  ) {
    return this.service.createNotice(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("LienNotice")
  @Post("lien-notices/:id/mark-sent")
  markNoticeSent(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markNoticeSent(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get("projects/:id/lien-filings")
  listFilingsForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listFilingsForProject(user.companyId, id);
  }

  @Post("projects/:id/lien-filings")
  createFiling(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createMechanicsLienFilingSchema)) body: CreateMechanicsLienFilingInput,
  ) {
    return this.service.createFiling(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("MechanicsLienFiling")
  @Post("lien-filings/:id/status")
  updateFilingStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLienFilingStatusSchema)) body: UpdateLienFilingStatusInput,
  ) {
    return this.service.updateFilingStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
