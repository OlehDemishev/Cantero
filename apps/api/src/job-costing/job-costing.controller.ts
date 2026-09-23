import { Body, Controller, Get, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { createCostCodeBudgetTransferSchema, type AuthUser, type CreateCostCodeBudgetTransferInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JobCostingService } from "./job-costing.service";
import { Requires, RequiresFor } from "../common/decorators/permissions.decorator";

@RequiresFor("finance.view", "finance.manage")
@Controller("job-costing")
export class JobCostingController {
  constructor(private readonly service: JobCostingService) {}

  @Requires("costing.view")
  @Get()
  report(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.report(user.companyId, projectId);
  }

  @Requires("costing.view")
  @Get("forecast")
  forecastReport(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.forecastReport(user.companyId, projectId);
  }

  @Requires("costing.view")
  @Get("history")
  history(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string, @Query("months") months?: string) {
    return this.service.history(user.companyId, projectId, months ? Number(months) : undefined);
  }

  @Post("budget-transfers")
  addBudgetTransfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCostCodeBudgetTransferSchema)) body: CreateCostCodeBudgetTransferInput,
  ) {
    return this.service.addBudgetTransfer(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
