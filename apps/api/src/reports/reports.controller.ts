import { Controller, Get, Header, Query, StreamableFile } from "@nestjs/common";
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

  @Get("estimate-at-completion")
  estimateAtCompletion(@CurrentUser() user: AuthUser) {
    return this.service.estimateAtCompletion(user.companyId);
  }

  @Get("revenue-trend")
  revenueTrend(@CurrentUser() user: AuthUser) {
    return this.service.revenueTrend(user.companyId);
  }

  @Get("period-comparison")
  periodComparison(@CurrentUser() user: AuthUser, @Query("months") months?: string) {
    return this.service.periodComparison(user.companyId, months ? Number(months) : undefined);
  }

  @Get("tax-summary")
  @Header("Content-Type", "text/csv")
  taxSummary(@CurrentUser() user: AuthUser) {
    return this.service.taxSummaryCsv(user.companyId);
  }

  @Get("wip-report")
  wipReport(@CurrentUser() user: AuthUser) {
    return this.service.wipReport(user.companyId);
  }

  @Get("wip-report/pdf")
  @Header("Content-Type", "application/pdf")
  async wipReportPdf(@CurrentUser() user: AuthUser) {
    const buffer = await this.service.wipReportPdf(user.companyId);
    return new StreamableFile(buffer, { disposition: `attachment; filename="wip-report.pdf"` });
  }
}
