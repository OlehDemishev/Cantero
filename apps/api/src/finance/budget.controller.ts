import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { BudgetService } from "./budget.service";

@Controller("finance/budget-vs-actual")
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.getForProject(user.companyId, projectId);
  }
}
