import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  completeEnrollmentSchema,
  createTrainingCourseSchema,
  enrollWorkerSchema,
  updateTrainingCourseSchema,
  type AuthUser,
  type CompleteEnrollmentInput,
  type CreateTrainingCourseInput,
  type EnrollWorkerInput,
  type UpdateTrainingCourseInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TrainingService } from "./training.service";

@Controller("training")
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get("courses")
  listCourses(@CurrentUser() user: AuthUser) {
    return this.service.listCourses(user.companyId);
  }

  @Post("courses")
  createCourse(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTrainingCourseSchema)) body: CreateTrainingCourseInput) {
    return this.service.createCourse(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("courses/:id")
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTrainingCourseSchema)) body: UpdateTrainingCourseInput,
  ) {
    return this.service.updateCourse(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete("courses/:id")
  deleteCourse(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteCourse(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get("courses/:id/enrollments")
  listEnrollments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listEnrollments(user.companyId, id);
  }

  @Post("courses/:id/enrollments")
  enroll(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(enrollWorkerSchema)) body: EnrollWorkerInput) {
    return this.service.enroll(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("enrollments/:id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeEnrollmentSchema)) body: CompleteEnrollmentInput,
  ) {
    return this.service.complete(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("compliance-gaps")
  complianceGaps(@CurrentUser() user: AuthUser) {
    return this.service.complianceGaps(user.companyId);
  }

  @Get("workers/:workerId/enrollments")
  listForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listForWorker(user.companyId, workerId);
  }
}
