import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { submitSubcontractorCostSchema, type SubmitSubcontractorCostInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorPortalAuthGuard } from "./subcontractor-portal-auth.guard";
import { CurrentPortalSubcontractor } from "./current-portal-subcontractor.decorator";
import type { PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";
import { SubcontractorPortalService } from "./subcontractor-portal.service";

/** @Public() bypasses the internal-user JwtAuthGuard chain; SubcontractorPortalAuthGuard independently requires a valid subcontractor-portal token. */
@Public()
@UseGuards(SubcontractorPortalAuthGuard)
@Controller("subcontractor-portal")
export class SubcontractorPortalController {
  constructor(private readonly service: SubcontractorPortalService) {}

  @Get("me")
  me(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.service.me(subcontractor);
  }

  @Get("projects")
  listProjects(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.service.listProjects(subcontractor);
  }

  @Get("costs")
  listCosts(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.service.listCosts(subcontractor);
  }

  @Post("costs")
  submitCost(
    @CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext,
    @Body(new ZodValidationPipe(submitSubcontractorCostSchema)) body: SubmitSubcontractorCostInput,
  ) {
    return this.service.submitCost(subcontractor, body);
  }
}
