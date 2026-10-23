import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  DASHBOARD_WIDGET_PERMISSIONS,
  canViewDashboardWidget,
  type AuthUser,
  type CreateDashboardWidgetInput,
  type DashboardWidgetType,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { ReportsService } from "../reports/reports.service";
import { CustomReportsService } from "../reports/custom-reports.service";
import { LaborCostService } from "../team/labor-cost.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly reports: ReportsService,
    private readonly customReports: CustomReportsService,
    private readonly laborCost: LaborCostService,
  ) {}

  /** Every widget renders from an existing report/insight endpoint — this is the only place
   * that maps a widget's type + config to the right one of those, so adding a widget type never
   * means writing a new query, just wiring an existing one in here. Callers check the widget's
   * capability (DASHBOARD_WIDGET_PERMISSIONS) first; the viewer is passed on so project-scoped
   * reports narrow exactly as their own endpoint does. */
  private async resolveData(user: AuthUser, type: DashboardWidgetType, config: Record<string, unknown> | null) {
    const { companyId } = user;
    const cfg = config ?? {};
    switch (type) {
      case "revenue_trend":
        return this.reports.revenueTrend(companyId, typeof cfg.months === "number" ? cfg.months : undefined);
      case "cash_flow_forecast":
        return this.reports.cashFlowForecast(companyId);
      case "project_margins":
        return this.reports.projectMargins(companyId, user);
      case "portfolio_summary":
        return this.reports.portfolio(companyId, user);
      case "invoice_aging":
        return this.reports.invoiceAging(companyId, user);
      case "warehouse_turnover":
        return this.reports.warehouseTurnover(companyId);
      case "labor_cost":
        return this.laborCost.report(companyId, {
          from: typeof cfg.from === "string" ? cfg.from : undefined,
          to: typeof cfg.to === "string" ? cfg.to : undefined,
        });
      case "custom_report":
        if (typeof cfg.customReportId !== "string") return null;
        return this.customReports.run(companyId, cfg.customReportId, user);
      case "backlog":
        return this.reports.backlog(companyId);
      case "compliance_calendar":
        return this.reports.complianceCalendar(
          companyId,
          typeof cfg.lookaheadDays === "number" ? cfg.lookaheadDays : undefined,
          user,
        );
    }
  }

  /** The member's widgets, each with its data. A widget whose capability the member no longer holds
   * (role changed, permission revoked) is left out entirely rather than shown empty, and comes back
   * if the capability is granted again. */
  async list(user: AuthUser) {
    const { companyId, userId } = user;
    const widgets = await this.prisma.dashboardWidget.findMany({
      where: { companyId, userId },
      orderBy: { sortOrder: "asc" },
    });
    return Promise.all(
      widgets
        .filter((w) => canViewDashboardWidget(w.type, user.permissions))
        .map(async (w) => ({
          ...w,
          data: await this.resolveData(user, w.type, w.config as Record<string, unknown> | null).catch(() => null),
        })),
    );
  }

  async create(user: AuthUser, input: CreateDashboardWidgetInput) {
    const { companyId, userId } = user;
    if (!canViewDashboardWidget(input.type, user.permissions)) {
      throw new ForbiddenException(`Requires the "${DASHBOARD_WIDGET_PERMISSIONS[input.type]}" permission`);
    }
    if (input.type === "custom_report") {
      // Same reach as GET /custom-reports/:id/run: any saved report of the member's own company.
      const reportId = input.config?.customReportId;
      if (typeof reportId !== "string") throw new BadRequestException("customReportId is required for a custom_report widget");
      const report = await this.prisma.customReport.findFirst({ where: { id: reportId, companyId }, select: { id: true } });
      if (!report) throw new NotFoundException("Report not found");
    }
    const last = await this.prisma.dashboardWidget.findFirst({
      where: { companyId, userId },
      orderBy: { sortOrder: "desc" },
    });
    return this.prisma.dashboardWidget.create({
      data: {
        companyId,
        userId,
        type: input.type,
        config: (input.config ?? undefined) as never,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  /** Deleting needs no capability: a member can always clear a widget from their own dashboard. */
  async delete({ companyId, userId }: AuthUser, id: string) {
    const widget = await this.prisma.dashboardWidget.findFirst({ where: { id, companyId, userId } });
    if (!widget) throw new NotFoundException("Widget not found");
    await this.prisma.dashboardWidget.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(user: AuthUser, orderedIds: string[]) {
    const { companyId, userId } = user;
    await Promise.all(
      orderedIds.map((id, index) =>
        this.prisma.dashboardWidget.updateMany({ where: { id, companyId, userId }, data: { sortOrder: index } }),
      ),
    );
    return this.list(user);
  }

  /** A tabular KPI summary of the user's current dashboard — reuses PdfService's table-document
   * renderer rather than attempting to rasterize each widget's chart, consistent with the rest
   * of the app's PDF exports (invoices, estimates, closeout) all being table-shaped. Built from
   * list(), so it carries only the widgets the member may still see. */
  async exportPdf(user: AuthUser): Promise<Buffer> {
    const [widgets, company] = await Promise.all([
      this.list(user),
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true } }),
    ]);
    const rows = widgets.map((w) => ({
      cells: [this.widgetLabel(w.type), this.summarize(w.type, w.data)],
    }));

    return this.pdf.render({
      title: "Dashboard summary",
      subtitle: company.name,
      meta: [{ label: "Generated", value: new Date().toLocaleDateString() }],
      tableHeader: ["Widget", "Summary"],
      tableRows: rows,
      totals: [],
    });
  }

  private widgetLabel(type: DashboardWidgetType): string {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** One-line summary per widget type — enough for a stakeholder skim, not a full re-render of the table/chart. */
  private summarize(type: DashboardWidgetType, data: unknown): string {
    if (!data) return "No data";
    if (type === "revenue_trend" && Array.isArray(data)) {
      const last = data[data.length - 1] as { month: string; revenue: number } | undefined;
      return last ? `${last.month}: ${last.revenue}` : "No data";
    }
    if (type === "cash_flow_forecast" && typeof data === "object") {
      const d = data as { totals?: { net?: number } };
      return d.totals?.net !== undefined ? `Net: ${d.totals.net}` : "No data";
    }
    if (type === "portfolio_summary" && typeof data === "object") {
      const d = data as { summary?: { projectsTotal?: number; projectsAtRisk?: number } };
      return d.summary ? `${d.summary.projectsTotal ?? 0} projects, ${d.summary.projectsAtRisk ?? 0} at risk` : "No data";
    }
    if (type === "compliance_calendar" && typeof data === "object") {
      const d = data as { expiredCount?: number; expiringCount?: number };
      return `${d.expiredCount ?? 0} expired, ${d.expiringCount ?? 0} expiring soon`;
    }
    if (Array.isArray(data)) return `${data.length} row(s)`;
    return "See dashboard for detail";
  }
}
