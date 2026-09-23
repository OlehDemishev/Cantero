import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import { updateDocumentTagsSchema, type AuthUser, type Locale, type UpdateDocumentTagsInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles, Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DocumentsService } from "./documents.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("Document")
@OpenToAllRoles("site and project work every member does")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId?: string,
    @Query("invoiceId") invoiceId?: string,
    @Query("punchListItemId") punchListItemId?: string,
    @Query("dailyLogId") dailyLogId?: string,
    @Query("incidentReportId") incidentReportId?: string,
    @Query("warrantyClaimId") warrantyClaimId?: string,
    @Query("subcontractorDocumentId") subcontractorDocumentId?: string,
    @Query("deficiencyId") deficiencyId?: string,
    @Query("permitId") permitId?: string,
    @Query("safetyBriefingId") safetyBriefingId?: string,
    @Query("supplierDocumentId") supplierDocumentId?: string,
    @Query("companyDocumentId") companyDocumentId?: string,
    @Query("insuranceClaimId") insuranceClaimId?: string,
    @Query("rfiId") rfiId?: string,
    @Query("safetyDataSheetId") safetyDataSheetId?: string,
    @Query("category") category?: string,
    @Query("search") search?: string,
    @Query("tag") tag?: string,
  ) {
    return this.service.list(
      user.companyId,
      {
        projectId,
        invoiceId,
        punchListItemId,
        dailyLogId,
        incidentReportId,
        warrantyClaimId,
        subcontractorDocumentId,
        deficiencyId,
        permitId,
        safetyBriefingId,
        supplierDocumentId,
        companyDocumentId,
        insuranceClaimId,
        rfiId,
        safetyDataSheetId,
        category,
        search,
        tag,
      },
      user.userId,
      user.role,
    );
  }

  @Roles("owner", "admin")
  @Get("deleted")
  listDeleted(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.service.listDeleted(user.companyId, undefined, cursor);
  }

  @Roles("owner", "admin")
  @Patch(":id/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.restore(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query("projectId") projectId?: string,
    @Query("invoiceId") invoiceId?: string,
    @Query("punchListItemId") punchListItemId?: string,
    @Query("dailyLogId") dailyLogId?: string,
    @Query("incidentReportId") incidentReportId?: string,
    @Query("warrantyClaimId") warrantyClaimId?: string,
    @Query("subcontractorDocumentId") subcontractorDocumentId?: string,
    @Query("deficiencyId") deficiencyId?: string,
    @Query("permitId") permitId?: string,
    @Query("safetyBriefingId") safetyBriefingId?: string,
    @Query("supplierDocumentId") supplierDocumentId?: string,
    @Query("companyDocumentId") companyDocumentId?: string,
    @Query("insuranceClaimId") insuranceClaimId?: string,
    @Query("rfiId") rfiId?: string,
    @Query("safetyDataSheetId") safetyDataSheetId?: string,
    @Query("locale") locale?: Locale,
    @Query("category") category?: string,
    @Query("tags") tags?: string,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.upload(user.companyId, user.userId, file, {
      projectId,
      invoiceId,
      punchListItemId,
      dailyLogId,
      incidentReportId,
      warrantyClaimId,
      subcontractorDocumentId,
      deficiencyId,
      permitId,
      safetyBriefingId,
      supplierDocumentId,
      companyDocumentId,
      insuranceClaimId,
      rfiId,
      safetyDataSheetId,
      locale,
      category,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    });
  }

  @Post(":id/replace")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async replace(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.replace(user.companyId, id, user.userId, file, user.userId, user.role);
  }

  @Patch(":id/tags")
  updateTags(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDocumentTagsSchema)) body: UpdateDocumentTagsInput,
  ) {
    return this.service.updateTags(user.companyId, id, body.tags, user.userId, user.role);
  }

  @Get(":id/versions")
  versions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.versions(user.companyId, id, user.userId, user.role);
  }

  @Get(":id/download")
  @Header("Content-Type", "application/octet-stream")
  async download(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { buffer, name } = await this.service.download(user.companyId, id, user.userId, user.role);
    return new StreamableFile(buffer, { disposition: `attachment; filename="${name}"` });
  }

  @Roles("owner", "admin")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id, user.userId, user.role);
  }
}
