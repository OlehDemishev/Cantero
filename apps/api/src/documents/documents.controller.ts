import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { DocumentsService } from "./documents.service";

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
    @Query("category") category?: string,
    @Query("search") search?: string,
  ) {
    return this.service.list(user.companyId, {
      projectId,
      invoiceId,
      punchListItemId,
      dailyLogId,
      incidentReportId,
      warrantyClaimId,
      subcontractorDocumentId,
      deficiencyId,
      category,
      search,
    });
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
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
    @Query("category") category?: string,
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
      category,
    });
  }

  @Post(":id/replace")
  @UseInterceptors(FileInterceptor("file"))
  async replace(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.replace(user.companyId, id, user.userId, file);
  }

  @Get(":id/versions")
  versions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.versions(user.companyId, id);
  }

  @Get(":id/download")
  @Header("Content-Type", "application/octet-stream")
  async download(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { buffer, name } = await this.service.download(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="${name}"` });
  }

  @Roles("owner", "admin")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
