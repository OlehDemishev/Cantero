import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { createBidRequestSchema, type AuthUser, type CreateBidRequestInput } from "@cantero/shared";
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
}
