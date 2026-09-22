import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createBenefitPlanSchema,
  createBenefitPlanTierSchema,
  enrollWorkerInBenefitSchema,
  updateBenefitPlanSchema,
  updateEnrollmentStatusSchema,
  type AuthUser,
  type CreateBenefitPlanInput,
  type CreateBenefitPlanTierInput,
  type EnrollWorkerInBenefitInput,
  type UpdateBenefitPlanInput,
  type UpdateEnrollmentStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BenefitsService } from "./benefits.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("benefit plans and enrollments belong to workers, not projects")
@Controller()
export class BenefitsController {
  constructor(private readonly service: BenefitsService) {}

  @Get("benefits/plans")
  listPlans(@CurrentUser() user: AuthUser) {
    return this.service.listPlans(user.companyId);
  }

  @Post("benefits/plans")
  createPlan(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createBenefitPlanSchema)) body: CreateBenefitPlanInput) {
    return this.service.createPlan(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("benefits/plans/:id")
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBenefitPlanSchema)) body: UpdateBenefitPlanInput,
  ) {
    return this.service.updatePlan(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("benefits/plans/:id/tiers")
  addTier(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createBenefitPlanTierSchema)) body: CreateBenefitPlanTierInput,
  ) {
    return this.service.addTier(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("benefits/plans/:id/enroll/:workerId")
  enrollWorker(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("workerId") workerId: string,
    @Body(new ZodValidationPipe(enrollWorkerInBenefitSchema)) body: EnrollWorkerInBenefitInput,
  ) {
    return this.service.enrollWorker(user.companyId, { userId: user.userId, name: user.name }, workerId, id, body);
  }

  @Post("benefits/enrollments/:id/status")
  updateEnrollmentStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEnrollmentStatusSchema)) body: UpdateEnrollmentStatusInput,
  ) {
    return this.service.updateEnrollmentStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("benefits/cost-summary")
  costSummary(@CurrentUser() user: AuthUser) {
    return this.service.costSummary(user.companyId);
  }

  @Get("benefits/payroll-deduction-export")
  payrollDeductionExport(@CurrentUser() user: AuthUser) {
    return this.service.payrollDeductionExport(user.companyId);
  }

  @Get("workers/:workerId/benefit-enrollments")
  listEnrollmentsForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listEnrollmentsForWorker(user.companyId, workerId);
  }
}
