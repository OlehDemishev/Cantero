import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  createRateCatalogItemSchema,
  updateRateCatalogItemSchema,
  evaluateFormulaSchema,
  decideRateCatalogPendingChangeSchema,
  type AuthUser,
  type CreateRateCatalogItemInput,
  type UpdateRateCatalogItemInput,
  type EvaluateFormulaInput,
  type DecideRateCatalogPendingChangeInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles, Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateCatalogService } from "./rate-catalog.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company rate catalog items and their pending changes")
@Requires("pricing.manage")
@Controller("estimates/rate-catalog")
export class RateCatalogController {
  constructor(private readonly service: RateCatalogService) {}

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("catalogId") catalogId?: string) {
    return this.service.list(user.companyId, catalogId);
  }

  // Declared before ":id" so "starter"/"import" aren't swallowed as an item id.
  @Roles("owner", "admin")
  @Post("starter")
  seedStarter(@CurrentUser() user: AuthUser) {
    return this.service.seedStarter(user.companyId, { userId: user.userId, name: user.name });
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get("pending-changes")
  listPendingChanges(@CurrentUser() user: AuthUser) {
    return this.service.listPendingChanges(user.companyId);
  }

  @Roles("owner", "admin")
  @Post("pending-changes/:id/approve")
  approvePendingChange(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideRateCatalogPendingChangeSchema)) body: DecideRateCatalogPendingChangeInput,
  ) {
    return this.service.approvePendingChange(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Roles("owner", "admin")
  @Post("pending-changes/:id/reject")
  rejectPendingChange(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideRateCatalogPendingChangeSchema)) body: DecideRateCatalogPendingChangeInput,
  ) {
    return this.service.rejectPendingChange(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get(":id/history")
  history(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.history(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRateCatalogItemSchema)) body: CreateRateCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRateCatalogItemSchema)) body: UpdateRateCatalogItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @OpenToAllRoles("evaluating a rate's formula changes nothing")
  @Post(":id/evaluate-formula")
  evaluateFormula(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(evaluateFormulaSchema)) body: EvaluateFormulaInput,
  ) {
    return this.service.evaluateFormula(user.companyId, id, body);
  }
}
