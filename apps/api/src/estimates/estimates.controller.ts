import { Body, Controller, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import {
  createEstimateLineSchema,
  createEstimateSchema,
  createFromTemplateSchema,
  saveAsTemplateSchema,
  type AuthUser,
  type CreateEstimateInput,
  type CreateEstimateLineInput,
  type CreateFromTemplateInput,
  type SaveAsTemplateInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimatesService } from "./estimates.service";

@Controller("estimates")
export class EstimatesController {
  constructor(private readonly service: EstimatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "templates" isn't swallowed as an estimate id.
  @Get("templates")
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.service.listTemplates(user.companyId);
  }

  @Post("from-template/:templateId")
  createFromTemplate(
    @CurrentUser() user: AuthUser,
    @Param("templateId") templateId: string,
    @Body(new ZodValidationPipe(createFromTemplateSchema)) body: CreateFromTemplateInput,
  ) {
    return this.service.createFromTemplate(user.companyId, templateId, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEstimateSchema)) body: CreateEstimateInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/lines")
  addLine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createEstimateLineSchema)) body: CreateEstimateLineInput,
  ) {
    return this.service.addLine(user.companyId, id, body);
  }

  @Post(":id/recalculate")
  recalculate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.recalculate(user.companyId, id);
  }

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, id);
  }

  @Post(":id/save-as-template")
  saveAsTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAsTemplateSchema)) body: SaveAsTemplateInput,
  ) {
    return this.service.saveAsTemplate(user.companyId, id, body.name);
  }

  @Get(":id/revisions")
  listRevisions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listRevisions(user.companyId, id);
  }

  @Get(":id/revisions/:revisionId")
  getRevision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.service.getRevision(user.companyId, id, revisionId);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
