import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  bulkActionIdsSchema,
  createSubmittalSchema,
  reviewSubmittalSchema,
  updateSubmittalSchema,
  type AuthUser,
  type BulkActionIdsInput,
  type CreateSubmittalInput,
  type ReviewSubmittalInput,
  type UpdateSubmittalInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubmittalsService } from "./submittals.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("Submittal")
@Controller("submittals")
export class SubmittalsController {
  constructor(private readonly service: SubmittalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("company-pending")
  listPendingForCompany(@CurrentUser() user: AuthUser) {
    return this.service.listPendingForCompany(user.companyId);
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

  @Post("bulk/approve")
  bulkApprove(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(bulkActionIdsSchema)) body: BulkActionIdsInput) {
    return this.service.bulkApprove(user.companyId, { userId: user.userId, name: user.name }, body.ids);
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
