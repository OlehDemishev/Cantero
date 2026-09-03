import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addWorkerCertificationSchema,
  adjustPtoBalanceSchema,
  createWorkerSchema,
  updateWorkerSchema,
  setClockInPinSchema,
  verifyClockInPinSchema,
  type AddWorkerCertificationInput,
  type AdjustPtoBalanceInput,
  type AuthUser,
  type CreateWorkerInput,
  type UpdateWorkerInput,
  type SetClockInPinInput,
  type VerifyClockInPinInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WorkersService } from "./workers.service";

@Controller("workers")
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "certifications/dashboard" isn't swallowed as a worker id.
  @Get("certifications/dashboard")
  certificationsDashboard(@CurrentUser() user: AuthUser) {
    return this.service.certificationsDashboard(user.companyId);
  }

  // Declared before ":id" so "kiosk" isn't swallowed as a worker id.
  @Get("kiosk")
  listKioskWorkers(@CurrentUser() user: AuthUser) {
    return this.service.listKioskWorkers(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/summary")
  summary(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.summary(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWorkerSchema)) body: CreateWorkerInput) {
    return this.service.create(user.companyId, body);
  }

  @Roles("owner", "admin")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkerSchema)) body: UpdateWorkerInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/certifications")
  listCertifications(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listCertifications(user.companyId, id);
  }

  @Post(":id/certifications")
  addCertification(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addWorkerCertificationSchema)) body: AddWorkerCertificationInput,
  ) {
    return this.service.addCertification(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/certifications/:certificationId")
  removeCertification(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("certificationId") certificationId: string,
  ) {
    return this.service.deleteCertification(user.companyId, id, certificationId);
  }

  @Roles("owner", "admin")
  @Post(":id/pto-balance/adjust")
  adjustPtoBalance(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adjustPtoBalanceSchema)) body: AdjustPtoBalanceInput,
  ) {
    return this.service.adjustPtoBalance(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Roles("owner", "admin")
  @Patch(":id/clock-in-pin")
  setClockInPin(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setClockInPinSchema)) body: SetClockInPinInput,
  ) {
    return this.service.setClockInPin(user.companyId, { userId: user.userId, name: user.name }, id, body.pin);
  }

  @Roles("owner", "admin")
  @Delete(":id/clock-in-pin")
  clearClockInPin(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.clearClockInPin(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/verify-clock-in-pin")
  verifyClockInPin(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifyClockInPinSchema)) body: VerifyClockInPinInput,
  ) {
    return this.service.verifyClockInPin(user.companyId, id, body.pin);
  }

  @Get(":id/onboarding-tasks")
  listOnboardingTasks(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listOnboardingTasks(user.companyId, id);
  }

  @Post(":id/onboarding-tasks/:taskId/toggle")
  toggleOnboardingTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.service.toggleOnboardingTask(user.companyId, id, taskId);
  }

  @Get(":id/offboarding-tasks")
  listOffboardingTasks(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listOffboardingTasks(user.companyId, id);
  }

  @Post(":id/offboarding-tasks/:taskId/toggle")
  toggleOffboardingTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.service.toggleOffboardingTask(user.companyId, id, taskId);
  }
}
