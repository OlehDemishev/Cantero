import { Controller, Get, Header, Query, StreamableFile } from "@nestjs/common";
import { REPORT_ROLES, type AuthUser, type ReportKey } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ReportsService } from "./reports.service";

/** Who may open which report is one table shared with the web app — see REPORT_ROLES. */
const ReportRoles = (report: ReportKey) => Roles(...REPORT_ROLES[report]);

@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @ReportRoles("overview")
  @Get("overview")
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.companyId);
  }

  @ReportRoles("project-margins")
  @Get("project-margins")
  projectMargins(@CurrentUser() user: AuthUser) {
    return this.service.projectMargins(user.companyId, user);
  }

  @ReportRoles("warehouse-turnover")
  @Get("warehouse-turnover")
  warehouseTurnover(@CurrentUser() user: AuthUser) {
    return this.service.warehouseTurnover(user.companyId);
  }

  @ReportRoles("invoice-aging")
  @Get("invoice-aging")
  invoiceAging(@CurrentUser() user: AuthUser) {
    return this.service.invoiceAging(user.companyId, user);
  }

  @ReportRoles("portfolio")
  @Get("portfolio")
  portfolio(@CurrentUser() user: AuthUser) {
    return this.service.portfolio(user.companyId, user);
  }

  @ReportRoles("cash-flow-forecast")
  @Get("cash-flow-forecast")
  cashFlowForecast(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.cashFlowForecast(user.companyId, projectId);
  }

  @ReportRoles("estimate-at-completion")
  @Get("estimate-at-completion")
  estimateAtCompletion(@CurrentUser() user: AuthUser) {
    return this.service.estimateAtCompletion(user.companyId, user);
  }

  @ReportRoles("win-rate")
  @Get("win-rate")
  winRateReport(@CurrentUser() user: AuthUser) {
    return this.service.winRateReport(user.companyId);
  }

  @ReportRoles("revenue-trend")
  @Get("revenue-trend")
  revenueTrend(@CurrentUser() user: AuthUser) {
    return this.service.revenueTrend(user.companyId);
  }

  @ReportRoles("period-comparison")
  @Get("period-comparison")
  periodComparison(@CurrentUser() user: AuthUser, @Query("months") months?: string) {
    return this.service.periodComparison(user.companyId, months ? Number(months) : undefined);
  }

  @ReportRoles("tax-summary")
  @Get("tax-summary")
  @Header("Content-Type", "text/csv")
  taxSummary(@CurrentUser() user: AuthUser) {
    return this.service.taxSummaryCsv(user.companyId);
  }

  @ReportRoles("wip-report")
  @Get("wip-report")
  wipReport(@CurrentUser() user: AuthUser) {
    return this.service.wipReport(user.companyId, user);
  }

  @ReportRoles("backlog")
  @Get("backlog")
  backlog(@CurrentUser() user: AuthUser) {
    return this.service.backlog(user.companyId);
  }

  @ReportRoles("compliance-calendar")
  @Get("compliance-calendar")
  complianceCalendar(@CurrentUser() user: AuthUser, @Query("lookaheadDays") lookaheadDays?: string) {
    return this.service.complianceCalendar(user.companyId, lookaheadDays ? Number(lookaheadDays) : undefined, user);
  }

  @ReportRoles("wip-report")
  @Get("wip-report/pdf")
  @Header("Content-Type", "application/pdf")
  async wipReportPdf(@CurrentUser() user: AuthUser) {
    const buffer = await this.service.wipReportPdf(user.companyId, user);
    return new StreamableFile(buffer, { disposition: `attachment; filename="wip-report.pdf"` });
  }

  @ReportRoles("geofence-violations")
  @Get("geofence-violations")
  geofenceViolations(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.geofenceViolations(user.companyId, from, to, user);
  }

  @ReportRoles("geofence-violations")
  @Get("geofence-violations/csv")
  @Header("Content-Type", "text/csv")
  geofenceViolationsCsv(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.geofenceViolationsCsv(user.companyId, from, to, user);
  }

  @ReportRoles("equipment-utilization")
  @Get("equipment-utilization")
  equipmentUtilization(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.equipmentUtilization(user.companyId, from, to);
  }
}
