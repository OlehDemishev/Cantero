import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  DASHBOARD_WIDGET_PERMISSIONS,
  DASHBOARD_WIDGET_TYPES,
  DEFAULT_GRANTS,
  PERMISSION_KEYS,
  type AuthUser,
  type DashboardWidgetType,
} from "@cantero/shared";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { ReportsService } from "../reports/reports.service";
import { CustomReportsService } from "../reports/custom-reports.service";
import { LaborCostService } from "../team/labor-cost.service";
import { REQUIRES_KEY } from "../common/decorators/permissions.decorator";
import { ReportsController } from "../reports/reports.controller";
import { CustomReportsController } from "../reports/custom-reports.controller";
import { LaborCostController } from "../team/labor-cost.controller";

const COMPANY_A = "company-a";
const USER_1 = "user-1";

const member = (role: keyof typeof DEFAULT_GRANTS, permissions: readonly string[] = DEFAULT_GRANTS[role]): AuthUser => ({
  userId: USER_1,
  companyId: COMPANY_A,
  email: "u@example.com",
  name: "U",
  role,
  permissions: [...permissions],
  sid: "session-1",
});
const OWNER = member("owner", PERMISSION_KEYS);
const WORKER = member("worker");
const FOREMAN = member("foreman");

/** The endpoint each widget type mirrors — the map must ask for exactly what that endpoint does. */
const ENDPOINTS: Record<DashboardWidgetType, [object, string]> = {
  revenue_trend: [ReportsController, "revenueTrend"],
  cash_flow_forecast: [ReportsController, "cashFlowForecast"],
  project_margins: [ReportsController, "projectMargins"],
  portfolio_summary: [ReportsController, "portfolio"],
  invoice_aging: [ReportsController, "invoiceAging"],
  warehouse_turnover: [ReportsController, "warehouseTurnover"],
  labor_cost: [LaborCostController, "get"],
  custom_report: [CustomReportsController, "run"],
  backlog: [ReportsController, "backlog"],
  compliance_calendar: [ReportsController, "complianceCalendar"],
};

describe("DASHBOARD_WIDGET_PERMISSIONS", () => {
  it.each(DASHBOARD_WIDGET_TYPES)("%s asks for the same capability as its endpoint", (type) => {
    const [controller, handler] = ENDPOINTS[type];
    const fn = (controller as { prototype: Record<string, object> }).prototype[handler];
    const required = Reflect.getMetadata(REQUIRES_KEY, fn) ?? Reflect.getMetadata(REQUIRES_KEY, controller);
    expect(required).toBe(DASHBOARD_WIDGET_PERMISSIONS[type]);
  });
});

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    dashboardWidget: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock; updateMany: jest.Mock };
    customReport: { findFirst: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let pdf: { render: jest.Mock };
  let reports: Record<
    "revenueTrend" | "cashFlowForecast" | "portfolio" | "projectMargins" | "invoiceAging" | "complianceCalendar" | "warehouseTurnover",
    jest.Mock
  >;
  let customReports: { run: jest.Mock };
  let laborCost: { report: jest.Mock };

  beforeEach(async () => {
    prisma = {
      dashboardWidget: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
      },
      customReport: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Acme Co" }) },
    };
    pdf = { render: jest.fn().mockResolvedValue(Buffer.from("pdf")) };
    reports = {
      revenueTrend: jest.fn().mockResolvedValue([]),
      cashFlowForecast: jest.fn().mockResolvedValue({ totals: { net: 0 } }),
      portfolio: jest.fn().mockResolvedValue({ summary: {} }),
      projectMargins: jest.fn().mockResolvedValue([]),
      invoiceAging: jest.fn().mockResolvedValue([]),
      complianceCalendar: jest.fn().mockResolvedValue({ expiredCount: 1, expiringCount: 2 }),
      warehouseTurnover: jest.fn().mockResolvedValue([]),
    };
    customReports = { run: jest.fn() };
    laborCost = { report: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdf },
        { provide: ReportsService, useValue: reports },
        { provide: CustomReportsService, useValue: customReports },
        { provide: LaborCostService, useValue: laborCost },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  describe("list()", () => {
    it("resolves each widget's data from the matching report method", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "revenue_trend", config: { months: 6 } },
        { id: "w-2", type: "cash_flow_forecast", config: null },
      ]);
      reports.revenueTrend.mockResolvedValue([{ month: "2026-08", revenue: 100 }]);

      const result = await service.list(OWNER);

      expect(prisma.dashboardWidget.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY_A, userId: USER_1 } }));
      expect(reports.revenueTrend).toHaveBeenCalledWith(COMPANY_A, 6);
      expect(reports.cashFlowForecast).toHaveBeenCalledWith(COMPANY_A);
      expect(result[0].data).toEqual([{ month: "2026-08", revenue: 100 }]);
    });

    it("passes the viewer to project-scoped reports, as their own endpoints do", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "project_margins", config: null },
        { id: "w-2", type: "portfolio_summary", config: null },
        { id: "w-3", type: "invoice_aging", config: null },
        { id: "w-4", type: "compliance_calendar", config: { lookaheadDays: 30 } },
      ]);

      await service.list(OWNER);

      expect(reports.projectMargins).toHaveBeenCalledWith(COMPANY_A, OWNER);
      expect(reports.portfolio).toHaveBeenCalledWith(COMPANY_A, OWNER);
      expect(reports.invoiceAging).toHaveBeenCalledWith(COMPANY_A, OWNER);
      expect(reports.complianceCalendar).toHaveBeenCalledWith(COMPANY_A, 30, OWNER);
    });

    it("leaves out, without resolving, widgets the member can no longer see (e.g. after a role change)", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "cash_flow_forecast", config: null },
        { id: "w-2", type: "custom_report", config: { customReportId: "report-1" } },
        { id: "w-3", type: "compliance_calendar", config: null },
      ]);

      const result = await service.list(FOREMAN);

      expect(result.map((w) => w.id)).toEqual(["w-3"]);
      expect(reports.cashFlowForecast).not.toHaveBeenCalled();
      expect(customReports.run).not.toHaveBeenCalled();
    });

    it("shows a worker nothing from finance widgets left on their dashboard", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "revenue_trend", config: null }]);

      expect(await service.list(WORKER)).toEqual([]);
      expect(reports.revenueTrend).not.toHaveBeenCalled();
    });

    it("routes a custom_report widget to CustomReportsService.run using its configured id", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "custom_report", config: { customReportId: "report-1" } },
      ]);
      customReports.run.mockResolvedValue({ columns: [], rows: [] });

      const result = await service.list(OWNER);

      expect(customReports.run).toHaveBeenCalledWith(COMPANY_A, "report-1");
      expect(result[0].data).toEqual({ columns: [], rows: [] });
    });

    it("returns null data for a custom_report widget missing its customReportId, without throwing", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "custom_report", config: null }]);

      const result = await service.list(OWNER);

      expect(result[0].data).toBeNull();
      expect(customReports.run).not.toHaveBeenCalled();
    });

    it("swallows a failing widget's data-resolution error rather than failing the whole dashboard", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "revenue_trend", config: null }]);
      reports.revenueTrend.mockRejectedValue(new Error("db down"));

      const result = await service.list(OWNER);

      expect(result[0].data).toBeNull();
    });
  });

  describe("create()", () => {
    it("places a new widget after the current highest sortOrder", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue({ sortOrder: 3 });
      prisma.dashboardWidget.create.mockResolvedValue({ id: "w-2" });

      await service.create(OWNER, { type: "invoice_aging" });

      expect(prisma.dashboardWidget.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 4, companyId: COMPANY_A, userId: USER_1 }) }),
      );
    });

    it("starts at sortOrder 0 for a user's first widget", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);
      prisma.dashboardWidget.create.mockResolvedValue({ id: "w-1" });

      await service.create(OWNER, { type: "invoice_aging" });

      expect(prisma.dashboardWidget.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
      );
    });

    it("refuses a worker a cash_flow_forecast widget with a 403", async () => {
      await expect(service.create(WORKER, { type: "cash_flow_forecast" })).rejects.toThrow(ForbiddenException);
      expect(prisma.dashboardWidget.create).not.toHaveBeenCalled();
    });

    it("follows the member's effective permissions, not their role name", async () => {
      const foremanWithFinance = member("foreman", [...DEFAULT_GRANTS.foreman, "finance.view"]);
      const accountantWithoutRates = member("accountant", DEFAULT_GRANTS.accountant.filter((p) => p !== "people.rates"));
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);

      await expect(service.create(foremanWithFinance, { type: "revenue_trend" })).resolves.toBeUndefined();
      await expect(service.create(accountantWithoutRates, { type: "labor_cost" })).rejects.toThrow(ForbiddenException);
    });

    it("lets each default role add exactly the widget types its grants cover", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);
      prisma.customReport.findFirst.mockResolvedValue({ id: "report-1" });
      for (const role of Object.keys(DEFAULT_GRANTS) as (keyof typeof DEFAULT_GRANTS)[]) {
        for (const type of DASHBOARD_WIDGET_TYPES) {
          const attempt = service.create(member(role), { type, config: { customReportId: "report-1" } });
          if (DEFAULT_GRANTS[role].includes(DASHBOARD_WIDGET_PERMISSIONS[type])) await expect(attempt).resolves.not.toThrow();
          else await expect(attempt).rejects.toThrow(ForbiddenException);
        }
      }
    });

    describe("custom_report", () => {
      it("is refused without reports.custom, even for a report of the member's company", async () => {
        prisma.customReport.findFirst.mockResolvedValue({ id: "report-1" });

        await expect(service.create(FOREMAN, { type: "custom_report", config: { customReportId: "report-1" } })).rejects.toThrow(
          ForbiddenException,
        );
      });

      it("needs a customReportId", async () => {
        await expect(service.create(OWNER, { type: "custom_report" })).rejects.toThrow(BadRequestException);
        expect(prisma.dashboardWidget.create).not.toHaveBeenCalled();
      });

      it("only accepts a report of the member's own company, as GET /custom-reports/:id/run does", async () => {
        prisma.customReport.findFirst.mockResolvedValue(null);

        await expect(service.create(OWNER, { type: "custom_report", config: { customReportId: "other-co" } })).rejects.toThrow(
          NotFoundException,
        );
        expect(prisma.customReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other-co", companyId: COMPANY_A } }));
        expect(prisma.dashboardWidget.create).not.toHaveBeenCalled();
      });

      it("is created for a member with reports.custom and a report of their company", async () => {
        prisma.customReport.findFirst.mockResolvedValue({ id: "report-1" });
        prisma.dashboardWidget.findFirst.mockResolvedValue(null);

        await service.create(member("accountant"), { type: "custom_report", config: { customReportId: "report-1" } });

        expect(prisma.dashboardWidget.create).toHaveBeenCalled();
      });
    });
  });

  describe("delete()", () => {
    it("rejects deleting a widget that isn't this user's", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);

      await expect(service.delete(OWNER, "w-1")).rejects.toThrow(NotFoundException);
      expect(prisma.dashboardWidget.delete).not.toHaveBeenCalled();
    });

    it("lets a member remove a widget they can no longer see", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue({ id: "w-1", type: "cash_flow_forecast" });

      await expect(service.delete(WORKER, "w-1")).resolves.toEqual({ ok: true });
    });
  });

  describe("reorder()", () => {
    it("returns the reordered dashboard without widgets the member can't see", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "invoice_aging", config: null },
        { id: "w-2", type: "warehouse_turnover", config: null },
      ]);

      const result = await service.reorder(FOREMAN, ["w-2", "w-1"]);

      expect(result.map((w) => w.id)).toEqual(["w-2"]);
      expect(reports.invoiceAging).not.toHaveBeenCalled();
    });
  });

  describe("exportPdf()", () => {
    it("renders one table row per widget with a one-line summary", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "revenue_trend", config: null }]);
      reports.revenueTrend.mockResolvedValue([{ month: "2026-07", revenue: 50 }, { month: "2026-08", revenue: 100 }]);

      await service.exportPdf(OWNER);

      expect(pdf.render).toHaveBeenCalledWith(
        expect.objectContaining({
          tableRows: [{ cells: ["Revenue Trend", "2026-08: 100"] }],
        }),
      );
    });

    it("skips widgets the member can no longer see", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "cash_flow_forecast", config: null },
        { id: "w-2", type: "compliance_calendar", config: null },
      ]);

      await service.exportPdf(FOREMAN);

      expect(reports.cashFlowForecast).not.toHaveBeenCalled();
      expect(pdf.render).toHaveBeenCalledWith(
        expect.objectContaining({ tableRows: [{ cells: ["Compliance Calendar", "1 expired, 2 expiring soon"] }] }),
      );
    });
  });
});
