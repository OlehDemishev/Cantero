import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  addProjectMemberSchema,
  createProjectSchema,
  setProjectRestrictedSchema,
  updateProjectCurrencySchema,
  updateProjectBudgetAlertThresholdSchema,
  updateProjectContingencySchema,
  updateProjectGeofenceSchema,
  updateProjectPublicWorkSchema,
  updateProjectWarrantySchema,
  type AddProjectMemberInput,
  type AuthUser,
  type CreateProjectInput,
  type SetProjectRestrictedInput,
  type UpdateProjectCurrencyInput,
  type UpdateProjectBudgetAlertThresholdInput,
  type UpdateProjectContingencyInput,
  type UpdateProjectGeofenceInput,
  type UpdateProjectPublicWorkInput,
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
    return this.service.list(user.companyId, user.userId, user.role);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id, user.userId, user.role);
  }

  @Get(":id/members")
  listMembers(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listMembers(user.companyId, id);
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addProjectMemberSchema)) body: AddProjectMemberInput,
  ) {
    return this.service.addMember(user.companyId, { userId: user.userId, name: user.name }, id, body.userId);
  }

  @Delete(":id/members/:userId")
  removeMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") memberUserId: string) {
    return this.service.removeMember(user.companyId, { userId: user.userId, name: user.name }, id, memberUserId);
  }

  @Patch(":id/restricted")
  setRestricted(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setProjectRestrictedSchema)) body: SetProjectRestrictedInput,
  ) {
    return this.service.setRestricted(user.companyId, { userId: user.userId, name: user.name }, id, body.restrictedToMembers);
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
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Patch(":id/currency")
  updateCurrency(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectCurrencySchema)) body: UpdateProjectCurrencyInput,
  ) {
    return this.service.updateCurrency(user.companyId, id, body);
  }

  @Patch(":id/budget-alert-threshold")
  updateBudgetAlertThreshold(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectBudgetAlertThresholdSchema)) body: UpdateProjectBudgetAlertThresholdInput,
  ) {
    return this.service.updateBudgetAlertThreshold(user.companyId, id, body);
  }

  @Patch(":id/contingency")
  updateContingency(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectContingencySchema)) body: UpdateProjectContingencyInput,
  ) {
    return this.service.updateContingency(user.companyId, id, body);
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

  @Patch(":id/public-work")
  updatePublicWork(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectPublicWorkSchema)) body: UpdateProjectPublicWorkInput,
  ) {
    return this.service.updatePublicWork(user.companyId, id, body);
  }

  @Get(":id/closeout-readiness")
  closeoutReadiness(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.closeout.readiness(user.companyId, id);
  }

  @Get(":id/closeout-package")
  @Header("Content-Type", "application/zip")
  async closeoutPackage(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.closeout.buildPackage(user.companyId, id);
    return new StreamableFile(buffer);
  }

  @Post(":id/request-review")
  requestReview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.requestReview(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get(":id/gallery")
  gallery(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.gallery(user.companyId, id);
  }
}
