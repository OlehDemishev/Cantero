import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createCostCodeBudgetTransferSchema, type AuthUser, type CreateCostCodeBudgetTransferInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JobCostingService } from "./job-costing.service";

@Controller("job-costing")
export class JobCostingController {
  constructor(private readonly service: JobCostingService) {}

  @Get()
  report(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.report(user.companyId, projectId);
  }

  @Get("forecast")
  forecastReport(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.forecastReport(user.companyId, projectId);
  }

  @Post("budget-transfers")
  addBudgetTransfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCostCodeBudgetTransferSchema)) body: CreateCostCodeBudgetTransferInput,
  ) {
    return this.service.addBudgetTransfer(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
