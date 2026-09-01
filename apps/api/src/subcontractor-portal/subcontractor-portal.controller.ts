import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  signLienWaiverSchema,
  submitBidSchema,
  submitSubcontractorCostSchema,
  type SignLienWaiverInput,
  type SubmitBidInput,
  type SubmitSubcontractorCostInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorPortalAuthGuard } from "./subcontractor-portal-auth.guard";
import { CurrentPortalSubcontractor } from "./current-portal-subcontractor.decorator";
import type { PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";
import { SubcontractorPortalService } from "./subcontractor-portal.service";
import { BidRequestsService } from "../bidding/bid-requests.service";
import { PunchListService } from "../projects/punch-list.service";

/** @Public() bypasses the internal-user JwtAuthGuard chain; SubcontractorPortalAuthGuard independently requires a valid subcontractor-portal token. */
@Public()
@UseGuards(SubcontractorPortalAuthGuard)
@Controller("subcontractor-portal")
export class SubcontractorPortalController {
  constructor(
    private readonly service: SubcontractorPortalService,
    private readonly bidRequests: BidRequestsService,
    private readonly punchList: PunchListService,
  ) {}

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

  @Get("lien-waivers")
  listLienWaivers(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.service.listLienWaivers(subcontractor);
  }

  @Post("lien-waivers/:id/sign")
  signLienWaiver(
    @CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signLienWaiverSchema)) body: SignLienWaiverInput,
    @Req() req: Request,
  ) {
    return this.service.signLienWaiver(subcontractor, id, body, req.ip);
  }

  @Get("bid-requests")
  listBidRequests(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.bidRequests.listForSubcontractor(subcontractor);
  }

  @Post("bid-requests/:id/bid")
  submitBid(
    @CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitBidSchema)) body: SubmitBidInput,
  ) {
    return this.bidRequests.submitBid(subcontractor, id, body);
  }

  @Get("punch-list-items")
  listPunchListItems(@CurrentPortalSubcontractor() subcontractor: PortalSubcontractorContext) {
    return this.punchList.listForSubcontractor(subcontractor.companyId, subcontractor.subcontractorId);
  }
}
