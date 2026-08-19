import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { LaborCostService } from "./labor-cost.service";

@Controller("team/labor-cost-report")
export class LaborCostController {
  constructor(private readonly service: LaborCostService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.report(user.companyId, { from, to });
  }
}
