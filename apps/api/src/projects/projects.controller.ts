import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createProjectSchema,
  updateProjectGeofenceSchema,
  updateProjectWarrantySchema,
  type AuthUser,
  type CreateProjectInput,
  type UpdateProjectGeofenceInput,
  type UpdateProjectWarrantyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ProjectsService } from "./projects.service";
import { ProjectCloseoutService } from "./project-closeout.service";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly service: ProjectsService,
    private readonly closeout: ProjectCloseoutService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/weather-forecast")
  weatherForecast(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.weatherForecast(user.companyId, id);
  }

  @Get(":id/geocode")
  geocode(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.geocode(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Patch(":id/warranty")
  updateWarranty(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectWarrantySchema)) body: UpdateProjectWarrantyInput,
  ) {
    return this.service.updateWarranty(user.companyId, id, body);
  }

  @Patch(":id/geofence")
  updateGeofence(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectGeofenceSchema)) body: UpdateProjectGeofenceInput,
  ) {
    return this.service.updateGeofence(user.companyId, id, body);
  }

  @Delete(":id/geofence")
  clearGeofence(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.clearGeofence(user.companyId, id);
  }

  @Get(":id/closeout-package")
  @Header("Content-Type", "application/zip")
  async closeoutPackage(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.closeout.buildPackage(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
