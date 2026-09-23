import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createPerformanceGoalSchema,
  createPerformanceReviewCycleSchema,
  submitPerformanceReviewSchema,
  updatePerformanceGoalProgressSchema,
  type AuthUser,
  type CreatePerformanceGoalInput,
  type CreatePerformanceReviewCycleInput,
  type SubmitPerformanceReviewInput,
  type UpdatePerformanceGoalProgressInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PerformanceService } from "./performance.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("worker performance cycles, reviews and goals")
@Requires("hr.cases")
@Controller("performance")
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get("cycles")
  listCycles(@CurrentUser() user: AuthUser) {
    return this.service.listCycles(user.companyId);
  }

  @Post("cycles")
  createCycle(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createPerformanceReviewCycleSchema)) body: CreatePerformanceReviewCycleInput) {
    return this.service.createCycle(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post("cycles/:id/close")
  closeCycle(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.closeCycle(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get("cycles/:id/reviews")
  listReviewsForCycle(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listReviewsForCycle(user.companyId, id);
  }

  @Post("cycles/:id/reviews")
  submitReview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitPerformanceReviewSchema)) body: SubmitPerformanceReviewInput,
  ) {
    return this.service.submitReview(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("workers/:workerId/reviews")
  listReviewsForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listReviewsForWorker(user.companyId, workerId);
  }

  @Get("workers/:workerId/goals")
  listGoalsForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listGoalsForWorker(user.companyId, workerId);
  }

  @Post("workers/:workerId/goals")
  createGoal(
    @CurrentUser() user: AuthUser,
    @Param("workerId") workerId: string,
    @Body(new ZodValidationPipe(createPerformanceGoalSchema)) body: CreatePerformanceGoalInput,
  ) {
    return this.service.createGoal(user.companyId, { userId: user.userId, name: user.name }, workerId, body);
  }

  @Post("goals/:id/progress")
  updateGoalProgress(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePerformanceGoalProgressSchema)) body: UpdatePerformanceGoalProgressInput,
  ) {
    return this.service.updateGoalProgress(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
