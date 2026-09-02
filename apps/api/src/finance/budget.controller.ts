import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createBudgetRevisionSchema, type AuthUser, type CreateBudgetRevisionInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BudgetService } from "./budget.service";

@Controller("finance/budget-vs-actual")
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.getForProject(user.companyId, projectId);
  }

  @Post("revisions")
  addRevision(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBudgetRevisionSchema)) body: CreateBudgetRevisionInput,
  ) {
    return this.service.addRevision(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
