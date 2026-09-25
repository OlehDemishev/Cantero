import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import {
  addAssemblyToEstimateSchema,
  createEstimateLineSchema,
  createEstimateSchema,
  createFromTemplateSchema,
  createVariantSchema,
  declineOnBehalfOfClientSchema,
  saveAsTemplateSchema,
  updateEstimateCoverLetterSchema,
  type AddAssemblyToEstimateInput,
  type AuthUser,
  type CreateEstimateInput,
  type CreateEstimateLineInput,
  type CreateFromTemplateInput,
  type CreateVariantInput,
  type DeclineOnBehalfOfClientInput,
  type SaveAsTemplateInput,
  type UpdateEstimateCoverLetterInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimatesService } from "./estimates.service";
import { NotProjectScoped, ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";
import { DateQueryPipe } from "../common/pipes/query-pipes";

@ProjectResource("Estimate")
@RequiresFor("estimates.view", "estimates.manage")
@Controller("estimates")
export class EstimatesController {
  constructor(private readonly service: EstimatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId, user.role, user);
  }

  // Declared before ":id" so "templates" isn't swallowed as an estimate id.
  @Get("templates")
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.service.listTemplates(user.companyId);
  }

  @NotProjectScoped("the template is company-wide; the new estimate's project is in the body")
  @Post("from-template/:templateId")
  createFromTemplate(
    @CurrentUser() user: AuthUser,
    @Param("templateId") templateId: string,
    @Body(new ZodValidationPipe(createFromTemplateSchema)) body: CreateFromTemplateInput,
  ) {
    return this.service.createFromTemplate(user.companyId, templateId, body, user.role);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id, user.role);
  }

  @Get(":id/suggested-lines")
  suggestedLines(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.suggestedLines(user.companyId, id);
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
    return this.service.addLine(user.companyId, id, body, user.role);
  }

  @Post(":id/lines/from-assembly")
  addAssembly(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addAssemblyToEstimateSchema)) body: AddAssemblyToEstimateInput,
  ) {
    return this.service.addAssemblyToEstimate(user.companyId, id, body, user.role);
  }

  @Patch(":id/cover-letter")
  updateCoverLetter(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEstimateCoverLetterSchema)) body: UpdateEstimateCoverLetterInput,
  ) {
    return this.service.updateCoverLetter(user.companyId, id, body);
  }

  @Post(":id/recalculate")
  recalculate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.recalculate(user.companyId, id, user.role);
  }

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id, user.role);
  }

  @Post(":id/save-as-template")
  saveAsTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAsTemplateSchema)) body: SaveAsTemplateInput,
  ) {
    return this.service.saveAsTemplate(user.companyId, id, body.name, user.role);
  }

  @Get(":id/revisions")
  listRevisions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listRevisions(user.companyId, id, user.role);
  }

  // Declared before ":revisionId" so "diff" isn't swallowed as a revision id.
  @Get(":id/revisions/diff")
  diffRevisions(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("from", DateQueryPipe) from: string,
    @Query("to", DateQueryPipe) to: string,
  ) {
    return this.service.diffRevisions(user.companyId, id, from, to);
  }

  @Get(":id/revisions/:revisionId")
  getRevision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.service.getRevision(user.companyId, id, revisionId, user.role);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  /** Records that the client declined outside the portal (a phone call, an email, ...) — see
   * EstimatesService.declineOnBehalfOfClient. */
  @Post(":id/decline")
  declineOnBehalfOfClient(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(declineOnBehalfOfClientSchema)) body: DeclineOnBehalfOfClientInput,
  ) {
    return this.service.declineOnBehalfOfClient(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/create-variant")
  createVariant(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createVariantSchema)) body: CreateVariantInput,
  ) {
    return this.service.createVariant(user.companyId, id, body, user.role);
  }

  @Get(":id/variants")
  listVariants(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listVariants(user.companyId, id);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id, user.role);
    return new StreamableFile(buffer);
  }

  @Get(":id/signature")
  @Header("Content-Type", "image/png")
  async signature(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.getSignature(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
