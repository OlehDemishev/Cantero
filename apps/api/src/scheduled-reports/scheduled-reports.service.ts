import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import {
  canViewReport,
  SCHEDULED_REPORT_KEYS,
  type AuthUser,
  type CreateScheduledReportInput,
  type ScheduledReportType,
  type UpdateScheduledReportInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SCHEDULED_REPORTS_QUEUE } from "../common/queue/queue.module";
import { advanceDate } from "../finance/recurring-invoice-schedule";
import { ReportsService } from "../reports/reports.service";
import { html } from "../common/mail/html";
import { PermissionsService } from "../common/permissions/permissions.service";
import type { ProjectViewer } from "../common/project-access/project-access.service";

const SCHEDULED_REPORTS_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const REPORT_TYPE_LABELS: Record<ScheduledReportType, string> = {
  overview: "Company overview",
  project_margins: "Project margins",
  warehouse_turnover: "Warehouse turnover",
  invoice_aging: "Invoice aging",
  portfolio: "Portfolio dashboard",
  cash_flow_forecast: "13-week cash flow forecast",
};

/**
 * Who a report with no recorded author runs as: no such user, so no project membership, which
 * leaves out every restricted project (and, if the company took "projects.all" away from the
 * accountant role, every project). Rows created before authors were recorded get this until
 * someone saves them again; owner-level numbers would be the unsafe default.
 */
export const NO_AUTHOR_VIEWER: Required<ProjectViewer> = { userId: "00000000-0000-0000-0000-000000000000", role: "accountant" };

type ReportRow = { id: string; companyId: string; name: string; reportType: ScheduledReportType; recipientEmails: string[]; createdById: string | null };

@Injectable()
export class ScheduledReportsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly reports: ReportsService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    @InjectQueue(SCHEDULED_REPORTS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    // Same jobId + repeat options on every boot — BullMQ dedupes rather than stacking repeats.
    await this.queue.add(
      "run-due",
      {},
      { repeat: { every: SCHEDULED_REPORTS_CHECK_INTERVAL_MS }, jobId: "scheduled-reports-repeat" },
    );
  }

  list(companyId: string) {
    return this.prisma.scheduledReport.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  }

  /** `author` becomes who the report runs as — so they must be able to open that report themselves. */
  create(companyId: string, author: AuthUser, input: CreateScheduledReportInput) {
    this.assertCanView(author, input.reportType);
    return this.prisma.scheduledReport.create({
      data: {
        companyId,
        createdById: author.userId,
        name: input.name,
        reportType: input.reportType,
        frequency: input.frequency,
        recipientEmails: input.recipientEmails,
        nextRunAt: advanceDate(new Date(), input.frequency),
      },
    });
  }

  /** Whoever changes a report takes it over: otherwise anyone with reports.custom could add their
   * own address to a report an owner created and receive the owner's view of every project. */
  async update(companyId: string, editor: AuthUser, id: string, input: UpdateScheduledReportInput) {
    const report = await this.findOrThrow(companyId, id);
    this.assertCanView(editor, report.reportType);
    return this.prisma.scheduledReport.update({
      where: { id },
      data: {
        createdById: editor.userId,
        name: input.name,
        frequency: input.frequency,
        recipientEmails: input.recipientEmails,
        active: input.active,
      },
    });
  }

  async delete(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    await this.prisma.scheduledReport.delete({ where: { id } });
    return { ok: true };
  }

  /** Sends immediately without touching the schedule — a "send a test now" action, not a substitute run. */
  async sendNow(companyId: string, id: string) {
    const report = await this.findOrThrow(companyId, id);
    await this.sendReport(report);
    return { ok: true };
  }

  /** Fires on the repeatable schedule set up in onModuleInit — one pass over every due report across every company. */
  async runDuePass(): Promise<{ sent: number }> {
    const due = await this.prisma.scheduledReport.findMany({
      where: { active: true, nextRunAt: { lte: new Date() } },
    });

    let sent = 0;
    for (const report of due) {
      try {
        await this.sendReport(report);
        sent++;
      } catch (err) {
        this.logger.error(`Failed to send scheduled report ${report.id}: ${err instanceof Error ? err.message : err}`);
      }
      await this.prisma.scheduledReport.update({
        where: { id: report.id },
        data: { nextRunAt: advanceDate(report.nextRunAt, report.frequency), lastSentAt: new Date() },
      });
    }
    return { sent };
  }

  private assertCanView(user: AuthUser, reportType: ScheduledReportType) {
    if (!canViewReport(SCHEDULED_REPORT_KEYS[reportType], user.permissions)) {
      throw new ForbiddenException("You don't have access to this report");
    }
  }

  /**
   * The member a report's numbers are computed for — its author with their current role, so
   * restricted projects they can't see stay out of the email. A report whose author is gone
   * (no longer a member, or deleted) or was never recorded runs as NO_AUTHOR_VIEWER. One whose
   * author can no longer open that report isn't sent at all.
   */
  async viewerFor(report: Pick<ReportRow, "companyId" | "reportType" | "createdById">): Promise<Required<ProjectViewer>> {
    if (!report.createdById) return NO_AUTHOR_VIEWER;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId: report.createdById, companyId: report.companyId } },
      include: { customRole: true },
    });
    if (!membership) return NO_AUTHOR_VIEWER;
    const granted = await this.permissions.effectiveFor(report.companyId, membership.role, membership.customRole);
    if (!canViewReport(SCHEDULED_REPORT_KEYS[report.reportType], granted)) {
      throw new ForbiddenException("The person who set up this report no longer has access to it — save it again to take it over");
    }
    return { userId: report.createdById, role: membership.role };
  }

  private async sendReport(report: ReportRow) {
    const viewer = await this.viewerFor(report);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: report.companyId } });
    const data = await this.fetchReportData(report.companyId, report.reportType, viewer);
    const highlights = this.buildHighlights(report.reportType, data, company.currency);
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const typeLabel = REPORT_TYPE_LABELS[report.reportType];

    const rowsHtml = highlights.map((h) => html`<tr><td style="padding:6px 12px;color:#6b7280;">${h.label}</td><td style="padding:6px 12px;font-weight:600;">${h.value}</td></tr>`);
    const rowsText = highlights.map((h) => `${h.label}: ${h.value}`).join("\n");

    for (const to of report.recipientEmails) {
      await this.mail.send({
        to,
        subject: `${report.name} — ${typeLabel}`,
        html: html`<div style="font-family:sans-serif;max-width:480px;"><h2 style="margin-bottom:4px;">${report.name}</h2><p style="color:#6b7280;margin-top:0;">${typeLabel}</p><table style="border-collapse:collapse;width:100%;">${rowsHtml}</table><p style="margin-top:16px;"><a href="${webOrigin}/reports">Open full report in Cantero →</a></p></div>`,
        text: `${report.name} — ${typeLabel}\n\n${rowsText}\n\nOpen full report: ${webOrigin}/reports`,
      });
    }
  }

  /** Same calls, with the same viewer, as the interactive GET /reports/<key> routes make. */
  private fetchReportData(companyId: string, reportType: ScheduledReportType, viewer: ProjectViewer) {
    switch (reportType) {
      case "overview":
        return this.reports.overview(companyId);
      case "project_margins":
        return this.reports.projectMargins(companyId, viewer);
      case "warehouse_turnover":
        return this.reports.warehouseTurnover(companyId);
      case "invoice_aging":
        return this.reports.invoiceAging(companyId, viewer);
      case "portfolio":
        return this.reports.portfolio(companyId, viewer);
      case "cash_flow_forecast":
        return this.reports.cashFlowForecast(companyId);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildHighlights(reportType: ScheduledReportType, data: any, currency: string): { label: string; value: string }[] {
    switch (reportType) {
      case "overview":
        return [
          { label: "Projects", value: String(data.projectsTotal) },
          { label: "Estimates approved", value: `${data.estimates.approved} / ${data.estimates.total}` },
          { label: "Invoiced total", value: `${data.invoices.totalValue} ${currency}` },
          { label: "Outstanding", value: `${data.invoices.outstandingValue} ${currency}` },
          { label: "Low stock items", value: String(data.materials.lowStockCount) },
        ];
      case "project_margins": {
        const totalMargin = Math.round(data.reduce((sum: number, p: { margin: number }) => sum + p.margin, 0) * 100) / 100;
        return [
          { label: "Projects", value: String(data.length) },
          { label: "Total margin", value: `${totalMargin} ${currency}` },
        ];
      }
      case "warehouse_turnover": {
        const slowMoving = data.filter((m: { slowMoving: boolean }) => m.slowMoving).length;
        return [
          { label: "Materials tracked", value: String(data.length) },
          { label: "Slow-moving", value: String(slowMoving) },
        ];
      }
      case "invoice_aging":
        return [
          { label: "Total outstanding", value: `${data.totalOutstanding} ${currency}` },
          { label: "DSO (days)", value: data.dso === null ? "—" : String(data.dso) },
          { label: "90+ days overdue", value: `${data.buckets.days90plus} ${currency}` },
        ];
      case "portfolio":
        return [
          { label: "Projects", value: String(data.summary.projectsTotal) },
          { label: "At risk", value: String(data.summary.projectsAtRisk) },
          { label: "Budget", value: `${data.summary.budgetTotal} ${currency}` },
          { label: "Actual", value: `${data.summary.actualTotal} ${currency}` },
          { label: "Variance", value: `${data.summary.varianceTotal} ${currency}` },
        ];
      case "cash_flow_forecast":
        return [
          { label: "13-week inflow", value: `${data.totals.inflow} ${currency}` },
          { label: "13-week outflow", value: `${data.totals.outflow} ${currency}` },
          { label: "13-week net", value: `${data.totals.net} ${currency}` },
        ];
    }
  }

  private async findOrThrow(companyId: string, id: string) {
    const report = await this.prisma.scheduledReport.findFirst({ where: { id, companyId } });
    if (!report) throw new NotFoundException("Scheduled report not found");
    return report;
  }
}
