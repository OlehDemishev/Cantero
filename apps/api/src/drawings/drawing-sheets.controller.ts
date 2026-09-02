import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  createDrawingSheetSchema,
  updateDrawingSheetSchema,
  type AuthUser,
  type UpdateDrawingSheetInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DrawingSheetsService } from "./drawing-sheets.service";

@Controller()
export class DrawingSheetsController {
  constructor(private readonly service: DrawingSheetsService) {}

  @Get("projects/:id/drawing-sheets")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Post("projects/:id/drawing-sheets")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("sheetNumber") sheetNumber: string,
    @Query("discipline") discipline?: string,
    @Query("title") title?: string,
    @Query("revision") revision?: string,
  ) {
    const input = createDrawingSheetSchema.parse({ sheetNumber, discipline, title, revision });
    return this.service.upload(user.companyId, { userId: user.userId, name: user.name }, projectId, file, input);
  }

  @Get("drawing-sheets/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get("drawing-sheets/:id/versions")
  versions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.versions(user.companyId, id);
  }

  @Post("drawing-sheets/:id/supersede")
  @UseInterceptors(FileInterceptor("file"))
  supersede(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query("revision") revision?: string,
    @Query("revisionDate") revisionDate?: string,
  ) {
    return this.service.supersede(user.companyId, { userId: user.userId, name: user.name }, id, file, { revision, revisionDate });
  }

  @Patch("drawing-sheets/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDrawingSheetSchema)) body: UpdateDrawingSheetInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete("drawing-sheets/:id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get("drawing-sheets/:id/file")
  async file(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, mimeType } = await this.service.download(user.companyId, id);
    res.set({ "Content-Type": mimeType });
    return new StreamableFile(buffer);
  }
}
