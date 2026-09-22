import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  calibrateTakeoffByRatioSchema,
  calibrateTakeoffSchema,
  createTakeoffMeasurementSchema,
  type AuthUser,
  type CalibrateTakeoffByRatioInput,
  type CalibrateTakeoffInput,
  type CreateTakeoffMeasurementInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TakeoffsService } from "./takeoffs.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("Takeoff")
@Controller("takeoffs")
export class TakeoffsController {
  constructor(private readonly service: TakeoffsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/image")
  async image(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { buffer, mimeType } = await this.service.image(user.companyId, id);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async create(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query("projectId") projectId: string,
    @Query("name") name: string,
    @Query("page") page?: string,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.create(user.companyId, projectId, name, file, page ? Number(page) : 1);
  }

  /** projectId rides in the query string so the project access guard checks it. */
  @Post("from-sheet")
  createFromSheet(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string, @Query("sheetId") sheetId: string, @Query("name") name?: string) {
    if (!projectId || !sheetId) throw new BadRequestException("projectId and sheetId are required");
    return this.service.createFromSheet(user.companyId, projectId, sheetId, name);
  }

  @Patch(":id/calibrate")
  calibrate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(calibrateTakeoffSchema)) body: CalibrateTakeoffInput,
  ) {
    return this.service.calibrate(user.companyId, id, body);
  }

  @Patch(":id/calibrate-ratio")
  calibrateByRatio(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(calibrateTakeoffByRatioSchema)) body: CalibrateTakeoffByRatioInput,
  ) {
    return this.service.calibrateByRatio(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }

  @Post(":id/measurements")
  addMeasurement(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTakeoffMeasurementSchema)) body: CreateTakeoffMeasurementInput,
  ) {
    return this.service.addMeasurement(user.companyId, id, body);
  }

  @Delete(":id/measurements/:measurementId")
  deleteMeasurement(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("measurementId") measurementId: string) {
    return this.service.deleteMeasurement(user.companyId, id, measurementId);
  }
}
