import { Body, Controller, Delete, Get, Param, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { importDrawingSetSchema, type AuthUser, type ImportDrawingSetInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MAX_DRAWING_SET_UPLOAD_BYTES } from "../common/upload-limits";
import { DrawingSetsService } from "./drawing-sets.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("DrawingSet")
@Requires("site.manage")
@Controller()
export class DrawingSetsController {
  constructor(private readonly service: DrawingSetsService) {}

  /** Reads the set and proposes sheet numbers; nothing is created until import. */
  @Post("projects/:projectId/drawing-sets")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DRAWING_SET_UPLOAD_BYTES } }))
  analyze(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.analyze(user.companyId, { userId: user.userId, name: user.name }, projectId, file);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("drawing-sets/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user, id);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("drawing-sets/:id/file")
  async file(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return new StreamableFile(await this.service.file(user, id), { type: "application/pdf" });
  }

  @Post("drawing-sets/:id/import")
  import(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(importDrawingSetSchema)) body: ImportDrawingSetInput) {
    return this.service.import(user, id, body);
  }

  @Delete("drawing-sets/:id")
  discard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.discard(user, id);
  }
}
