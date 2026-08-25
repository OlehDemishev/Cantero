import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDashboardWidgetInput, DashboardWidgetType } from "@cantero/shared";
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
   * means writing a new query, just wiring an existing one in here. */
  private async resolveData(companyId: string, type: DashboardWidgetType, config: Record<string, unknown> | null) {
    const cfg = config ?? {};
    switch (type) {
      case "revenue_trend":
        return this.reports.revenueTrend(companyId, typeof cfg.months === "number" ? cfg.months : undefined);
      case "cash_flow_forecast":
        return this.reports.cashFlowForecast(companyId);
      case "project_margins":
        return this.reports.projectMargins(companyId);
      case "portfolio_summary":
        return this.reports.portfolio(companyId);
      case "invoice_aging":
        return this.reports.invoiceAging(companyId);
      case "warehouse_turnover":
        return this.reports.warehouseTurnover(companyId);
      case "labor_cost":
        return this.laborCost.report(companyId, {
          from: typeof cfg.from === "string" ? cfg.from : undefined,
          to: typeof cfg.to === "string" ? cfg.to : undefined,
        });
      case "custom_report":
        if (typeof cfg.customReportId !== "string") return null;
        return this.customReports.run(companyId, cfg.customReportId);
    }
  }

  async list(companyId: string, userId: string) {
    const widgets = await this.prisma.dashboardWidget.findMany({
      where: { companyId, userId },
      orderBy: { sortOrder: "asc" },
    });
    return Promise.all(
      widgets.map(async (w) => ({
        ...w,
        data: await this.resolveData(companyId, w.type, w.config as Record<string, unknown> | null).catch(() => null),
      })),
    );
  }

  async create(companyId: string, userId: string, input: CreateDashboardWidgetInput) {
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

  async delete(companyId: string, userId: string, id: string) {
    const widget = await this.prisma.dashboardWidget.findFirst({ where: { id, companyId, userId } });
    if (!widget) throw new NotFoundException("Widget not found");
    await this.prisma.dashboardWidget.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(companyId: string, userId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.prisma.dashboardWidget.updateMany({ where: { id, companyId, userId }, data: { sortOrder: index } }),
      ),
    );
    return this.list(companyId, userId);
  }

  /** A tabular KPI summary of the user's current dashboard — reuses PdfService's table-document
   * renderer rather than attempting to rasterize each widget's chart, consistent with the rest
   * of the app's PDF exports (invoices, estimates, closeout) all being table-shaped. */
  async exportPdf(companyId: string, userId: string): Promise<Buffer> {
    const [widgets, company] = await Promise.all([
      this.list(companyId, userId),
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
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
    if (Array.isArray(data)) return `${data.length} row(s)`;
    return "See dashboard for detail";
  }
}
