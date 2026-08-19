import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CashFlowService } from "./cash-flow.service";

@Controller("finance/cash-flow-forecast")
export class CashFlowController {
  constructor(private readonly service: CashFlowService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.getForecast(user.companyId);
  }
}
