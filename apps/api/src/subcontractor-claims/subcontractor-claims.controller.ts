import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createBackchargeSchema,
  createDefaultNoticeSchema,
  type AuthUser,
  type CreateBackchargeInput,
  type CreateDefaultNoticeInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorClaimsService } from "./subcontractor-claims.service";
import { NotProjectScoped, ProjectResource } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("subcontractors.manage")
@Controller()
export class SubcontractorClaimsController {
  constructor(private readonly service: SubcontractorClaimsService) {}

  @Requires("subcontractors.view")
  @Get("projects/:id/subcontractor-backcharges")
  listBackchargesForProject(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listBackchargesForProject(user.companyId, projectId);
  }

  @Requires("finance.manage")
  @Post("projects/:id/subcontractor-backcharges")
  createBackcharge(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createBackchargeSchema)) body: CreateBackchargeInput,
  ) {
    return this.service.createBackcharge(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Requires("subcontractors.view")
  @NotProjectScoped("`:id` is a subcontractor company, not a project record")
  @Get("subcontractors/:id/backcharges")
  listBackchargesForSubcontractor(@CurrentUser() user: AuthUser, @Param("id") subcontractorId: string) {
    return this.service.listBackchargesForSubcontractor(user.companyId, subcontractorId);
  }

  @Requires("finance.manage")
  @ProjectResource("SubcontractorBackcharge")
  @Post("subcontractor-backcharges/:id/deduct")
  markBackchargeDeducted(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markBackchargeDeducted(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Requires("finance.manage")
  @ProjectResource("SubcontractorBackcharge")
  @Post("subcontractor-backcharges/:id/waive")
  markBackchargeWaived(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markBackchargeWaived(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Requires("subcontractors.view")
  @Get("projects/:id/subcontractor-default-notices")
  listNoticesForProject(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listNoticesForProject(user.companyId, projectId);
  }

  @Post("projects/:id/subcontractor-default-notices")
  createDefaultNotice(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createDefaultNoticeSchema)) body: CreateDefaultNoticeInput,
  ) {
    return this.service.createDefaultNotice(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Requires("subcontractors.view")
  @NotProjectScoped("`:id` is a subcontractor company, not a project record")
  @Get("subcontractors/:id/default-notices")
  listNoticesForSubcontractor(@CurrentUser() user: AuthUser, @Param("id") subcontractorId: string) {
    return this.service.listNoticesForSubcontractor(user.companyId, subcontractorId);
  }

  @ProjectResource("SubcontractorDefaultNotice")
  @Post("subcontractor-default-notices/:id/cure")
  markNoticeCured(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markNoticeCured(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @ProjectResource("SubcontractorDefaultNotice")
  @Post("subcontractor-default-notices/:id/terminate")
  markNoticeTerminated(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markNoticeTerminated(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
