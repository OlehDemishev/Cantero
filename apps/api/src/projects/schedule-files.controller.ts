import { BadRequestException, Controller, Get, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
  ParseUUIDPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import { ScheduleFilesService } from "./schedule-files.service";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("site.manage")
@Controller("schedule-files")
export class ScheduleFilesController {
  constructor(private readonly service: ScheduleFilesService) {}

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  import(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    if (!projectId) throw new BadRequestException("projectId is required");
    return this.service.importFile(user.companyId, { userId: user.userId, name: user.name }, projectId, file, user.role);
  }

  @Get("export")
  async export(
    @CurrentUser() user: AuthUser,
    @Query("projectId", ParseUUIDPipe) projectId: string,
    @Query("format") format: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (format !== "mspdi" && format !== "xer") throw new BadRequestException("format must be mspdi or xer");
    const { content, filename, contentType } = await this.service.exportFile(user.companyId, projectId, format, user.userId, user.role);
    res.set({ "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` });
    return new StreamableFile(Buffer.from(content, "utf-8"));
  }
}
