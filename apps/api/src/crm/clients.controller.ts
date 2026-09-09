import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  addClientActivitySchema,
  addClientReminderSchema,
  convertClientToProjectSchema,
  createClientSchema,
  moveClientStageSchema,
  updateClientSchema,
  updateReferralRewardSchema,
  type AddClientActivityInput,
  type AddClientReminderInput,
  type AuthUser,
  type ConvertClientToProjectInput,
  type CreateClientInput,
  type MoveClientStageInput,
  type UpdateClientInput,
  type UpdateReferralRewardInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ClientsService } from "./clients.service";

@Controller("clients")
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "reminders/upcoming" and "pipeline-summary" aren't swallowed as a client id.
  @Get("reminders/upcoming")
  upcomingReminders(@CurrentUser() user: AuthUser) {
    return this.service.listUpcomingReminders(user.companyId);
  }

  @Get("pipeline-summary")
  pipelineSummary(@CurrentUser() user: AuthUser) {
    return this.service.pipelineSummary(user.companyId);
  }

  @Get("pipeline-forecast")
  pipelineForecast(@CurrentUser() user: AuthUser) {
    return this.service.pipelineForecast(user.companyId);
  }

  @Get("funnel-report")
  funnelReport(@CurrentUser() user: AuthUser) {
    return this.service.funnelReport(user.companyId);
  }

  @Get("owner-leaderboard")
  ownerLeaderboard(@CurrentUser() user: AuthUser) {
    return this.service.ownerLeaderboard(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Post(":id/move-stage")
  moveStage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveClientStageSchema)) body: MoveClientStageInput,
  ) {
    return this.service.moveStage(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Patch(":id/referral-reward")
  updateReferralReward(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateReferralRewardSchema)) body: UpdateReferralRewardInput,
  ) {
    return this.service.updateReferralReward(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/convert-to-project")
  convertToProject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(convertClientToProjectSchema)) body: ConvertClientToProjectInput,
  ) {
    return this.service.convertToProject(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/activities")
  listActivities(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listActivities(user.companyId, id);
  }

  @Post(":id/activities")
  addActivity(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addClientActivitySchema)) body: AddClientActivityInput,
  ) {
    return this.service.addActivity(user.companyId, id, body);
  }

  @Get(":id/reminders")
  listReminders(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listReminders(user.companyId, id);
  }

  @Post(":id/reminders")
  addReminder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addClientReminderSchema)) body: AddClientReminderInput,
  ) {
    return this.service.addReminder(user.companyId, id, body);
  }

  @Post(":id/reminders/:reminderId/complete")
  completeReminder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("reminderId") reminderId: string,
  ) {
    return this.service.completeReminder(user.companyId, id, reminderId);
  }
}
