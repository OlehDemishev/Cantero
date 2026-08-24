import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.companyId);
  }

  @Get("project-margins")
  projectMargins(@CurrentUser() user: AuthUser) {
    return this.service.projectMargins(user.companyId);
  }

  @Get("warehouse-turnover")
  warehouseTurnover(@CurrentUser() user: AuthUser) {
    return this.service.warehouseTurnover(user.companyId);
  }

  @Get("invoice-aging")
  invoiceAging(@CurrentUser() user: AuthUser) {
    return this.service.invoiceAging(user.companyId);
  }

  @Get("portfolio")
  portfolio(@CurrentUser() user: AuthUser) {
    return this.service.portfolio(user.companyId);
  }

  @Get("cash-flow-forecast")
  cashFlowForecast(@CurrentUser() user: AuthUser) {
    return this.service.cashFlowForecast(user.companyId);
  }
}
