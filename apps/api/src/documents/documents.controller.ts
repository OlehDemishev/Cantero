import {
  BadRequestException,
  Controller,
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
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string, @Query("invoiceId") invoiceId?: string) {
    return this.service.list(user.companyId, projectId, invoiceId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query("projectId") projectId?: string,
    @Query("invoiceId") invoiceId?: string,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.upload(user.companyId, file, { projectId, invoiceId });
  }

  @Get(":id/download")
  @Header("Content-Type", "application/octet-stream")
  async download(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { buffer, name } = await this.service.download(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="${name}"` });
  }
}
