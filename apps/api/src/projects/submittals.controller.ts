import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createSubmittalSchema,
  reviewSubmittalSchema,
  updateSubmittalSchema,
  type AuthUser,
  type CreateSubmittalInput,
  type ReviewSubmittalInput,
  type UpdateSubmittalInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubmittalsService } from "./submittals.service";

@Controller("submittals")
export class SubmittalsController {
  constructor(private readonly service: SubmittalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSubmittalSchema)) body: CreateSubmittalInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubmittalSchema)) body: UpdateSubmittalInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Post(":id/submit")
  submit(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.submit(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/review")
  review(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewSubmittalSchema)) body: ReviewSubmittalInput,
  ) {
    return this.service.review(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/revise")
  revise(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.revise(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
