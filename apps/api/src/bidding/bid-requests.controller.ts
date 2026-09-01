import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  createBidRequestSchema,
  addBidScoreCriterionSchema,
  scoreBidSchema,
  type AuthUser,
  type CreateBidRequestInput,
  type AddBidScoreCriterionInput,
  type ScoreBidInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BidRequestsService } from "./bid-requests.service";

@Controller("bid-requests")
export class BidRequestsController {
  constructor(private readonly service: BidRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBidRequestSchema)) body: CreateBidRequestInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/award/:bidId")
  award(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bidId") bidId: string) {
    return this.service.award(user.companyId, { userId: user.userId, name: user.name }, id, bidId);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.cancel(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/criteria")
  addCriterion(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addBidScoreCriterionSchema)) body: AddBidScoreCriterionInput,
  ) {
    return this.service.addCriterion(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/criteria/:criterionId")
  removeCriterion(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("criterionId") criterionId: string) {
    return this.service.removeCriterion(user.companyId, { userId: user.userId, name: user.name }, id, criterionId);
  }

  @Post(":id/bids/:bidId/score")
  scoreBid(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @Body(new ZodValidationPipe(scoreBidSchema)) body: ScoreBidInput,
  ) {
    return this.service.scoreBid(user.companyId, { userId: user.userId, name: user.name }, id, bidId, body);
  }
}
