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
    return this.service.projectMargins(user.companyId, user);
  }

  @Get("warehouse-turnover")
  warehouseTurnover(@CurrentUser() user: AuthUser) {
    return this.service.warehouseTurnover(user.companyId);
  }

  @Get("invoice-aging")
  invoiceAging(@CurrentUser() user: AuthUser) {
    return this.service.invoiceAging(user.companyId, user);
  }

  @Get("portfolio")
  portfolio(@CurrentUser() user: AuthUser) {
    return this.service.portfolio(user.companyId, user);
  }

  @Get("cash-flow-forecast")
  cashFlowForecast(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.cashFlowForecast(user.companyId, projectId);
  }

  @Get("estimate-at-completion")
  estimateAtCompletion(@CurrentUser() user: AuthUser) {
    return this.service.estimateAtCompletion(user.companyId, user);
  }

  @Get("win-rate")
  winRateReport(@CurrentUser() user: AuthUser) {
    return this.service.winRateReport(user.companyId);
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
    return this.service.wipReport(user.companyId, user);
  }

  @Get("backlog")
  backlog(@CurrentUser() user: AuthUser) {
    return this.service.backlog(user.companyId);
  }

  @Get("compliance-calendar")
  complianceCalendar(@CurrentUser() user: AuthUser, @Query("lookaheadDays") lookaheadDays?: string) {
    return this.service.complianceCalendar(user.companyId, lookaheadDays ? Number(lookaheadDays) : undefined, user);
  }

  @Get("wip-report/pdf")
  @Header("Content-Type", "application/pdf")
  async wipReportPdf(@CurrentUser() user: AuthUser) {
    const buffer = await this.service.wipReportPdf(user.companyId, user);
    return new StreamableFile(buffer, { disposition: `attachment; filename="wip-report.pdf"` });
  }

  @Get("geofence-violations")
  geofenceViolations(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.geofenceViolations(user.companyId, from, to, user);
  }

  @Get("geofence-violations/csv")
  @Header("Content-Type", "text/csv")
  geofenceViolationsCsv(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.geofenceViolationsCsv(user.companyId, from, to, user);
  }

  @Get("equipment-utilization")
  equipmentUtilization(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.equipmentUtilization(user.companyId, from, to);
  }
}
