import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createPrequalificationSchema,
  decidePrequalificationSchema,
  type AuthUser,
  type CreatePrequalificationInput,
  type DecidePrequalificationInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorPrequalificationService } from "./subcontractor-prequalification.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("subcontractor companies and their prequalification")
@Controller()
export class SubcontractorPrequalificationController {
  constructor(private readonly service: SubcontractorPrequalificationService) {}

  @Get("subcontractor-prequalifications/expiring")
  expiringSoon(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    return this.service.expiringSoon(user.companyId, days ? Number(days) : undefined);
  }

  @Get("subcontractors/:id/prequalifications")
  list(@CurrentUser() user: AuthUser, @Param("id") subcontractorId: string) {
    return this.service.listForSubcontractor(user.companyId, subcontractorId);
  }

  @Post("subcontractors/:id/prequalifications")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") subcontractorId: string,
    @Body(new ZodValidationPipe(createPrequalificationSchema)) body: CreatePrequalificationInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, subcontractorId, body);
  }

  @Post("subcontractor-prequalifications/:id/decide")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decidePrequalificationSchema)) body: DecidePrequalificationInput,
  ) {
    return this.service.decide(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
