import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  answerRfiSchema,
  bulkActionIdsSchema,
  createRfiSchema,
  linkCostImpactChangeOrderSchema,
  setDrawingPinSchema,
  setRfiBallInCourtSchema,
  updateRfiSchema,
  type AnswerRfiInput,
  type AuthUser,
  type BallInCourtParty,
  type BulkActionIdsInput,
  type CreateRfiInput,
  type LinkCostImpactChangeOrderInput,
  type SetDrawingPinInput,
  type SetRfiBallInCourtInput,
  type UpdateRfiInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RfiService } from "./rfi.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";

@ProjectResource("Rfi")
@OpenToAllRoles("site and project work every member does")
@Controller("rfis")
export class RfiController {
  constructor(private readonly service: RfiService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("projectId", ParseUUIDPipe) projectId: string,
    @Query("ballInCourtParty") ballInCourtParty?: BallInCourtParty,
  ) {
    return this.service.listForProject(user.companyId, projectId, ballInCourtParty);
  }

  @Get("company-open")
  listOpenForCompany(@CurrentUser() user: AuthUser) {
    return this.service.listOpenForCompany(user.companyId, user);
  }

  @Get("cost-impact-summary")
  costImpactSummary(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.costImpactSummary(user.companyId, projectId);
  }

  @Get("analytics")
  analytics(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.analytics(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id, user.userId, user.role);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createRfiSchema)) body: CreateRfiInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateRfiSchema)) body: UpdateRfiInput) {
    return this.service.update(user.companyId, id, body, user.userId, user.role);
  }

  @Patch(":id/ball-in-court")
  setBallInCourt(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setRfiBallInCourtSchema)) body: SetRfiBallInCourtInput,
  ) {
    return this.service.setBallInCourt(user.companyId, { userId: user.userId, name: user.name }, id, body, user.userId, user.role);
  }

  @Patch(":id/pin")
  setPin(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(setDrawingPinSchema)) body: SetDrawingPinInput) {
    return this.service.setPin(user.companyId, id, body, user.userId, user.role);
  }

  @Patch(":id/change-order")
  linkChangeOrder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(linkCostImpactChangeOrderSchema)) body: LinkCostImpactChangeOrderInput,
  ) {
    return this.service.linkChangeOrder(user.companyId, id, body, user.userId, user.role);
  }

  @Post("bulk/close")
  bulkClose(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(bulkActionIdsSchema)) body: BulkActionIdsInput) {
    return this.service.bulkClose(user.companyId, { userId: user.userId, name: user.name }, body.ids, user.userId, user.role);
  }

  @Post(":id/answer")
  answer(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(answerRfiSchema)) body: AnswerRfiInput,
  ) {
    return this.service.answer(user.companyId, { userId: user.userId, name: user.name }, id, body, user.userId, user.role);
  }

  @Post(":id/close")
  close(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.close(user.companyId, { userId: user.userId, name: user.name }, id, user.userId, user.role);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id, user.userId, user.role);
  }
}
