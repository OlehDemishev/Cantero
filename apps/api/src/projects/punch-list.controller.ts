import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import {
  bulkActionIdsSchema,
  createPunchListItemSchema,
  linkPunchListChangeOrderSchema,
  setDrawingPinSchema,
  updatePunchListItemSchema,
  type AuthUser,
  type BulkActionIdsInput,
  type CreatePunchListItemInput,
  type LinkPunchListChangeOrderInput,
  type SetDrawingPinInput,
  type UpdatePunchListItemInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PunchListService } from "./punch-list.service";

@Controller("punch-list")
export class PunchListController {
  constructor(private readonly service: PunchListService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get("company-open")
  listOpenForCompany(@CurrentUser() user: AuthUser) {
    return this.service.listOpenForCompany(user.companyId);
  }

  @Get("pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    const buffer = await this.service.generatePdf(user.companyId, projectId);
    return new StreamableFile(buffer, { disposition: `attachment; filename="punch-list.pdf"` });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createPunchListItemSchema)) body: CreatePunchListItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePunchListItemSchema)) body: UpdatePunchListItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Patch(":id/pin")
  setPin(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(setDrawingPinSchema)) body: SetDrawingPinInput) {
    return this.service.setPin(user.companyId, id, body);
  }

  @Patch(":id/change-order")
  linkChangeOrder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(linkPunchListChangeOrderSchema)) body: LinkPunchListChangeOrderInput,
  ) {
    return this.service.linkChangeOrder(user.companyId, id, body);
  }

  // Registered ahead of ":id/resolve" and ":id/verify" — those are structurally the same
  // two-segment pattern, so route order decides which one "bulk/resolve" actually hits.
  @Post("bulk/resolve")
  bulkResolve(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(bulkActionIdsSchema)) body: BulkActionIdsInput) {
    return this.service.bulkResolve(user.companyId, { userId: user.userId, name: user.name }, body.ids);
  }

  @Post("bulk/verify")
  bulkVerify(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(bulkActionIdsSchema)) body: BulkActionIdsInput) {
    return this.service.bulkVerify(user.companyId, { userId: user.userId, name: user.name }, body.ids);
  }

  @Post(":id/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.resolve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/verify")
  verify(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.verify(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
