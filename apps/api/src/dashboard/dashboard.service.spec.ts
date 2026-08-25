import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { ReportsService } from "../reports/reports.service";
import { CustomReportsService } from "../reports/custom-reports.service";
import { LaborCostService } from "../team/labor-cost.service";

const COMPANY_A = "company-a";
const USER_1 = "user-1";

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    dashboardWidget: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock; updateMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let pdf: { render: jest.Mock };
  let reports: { revenueTrend: jest.Mock; cashFlowForecast: jest.Mock; portfolio: jest.Mock };
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
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Acme Co" }) },
    };
    pdf = { render: jest.fn().mockResolvedValue(Buffer.from("pdf")) };
    reports = {
      revenueTrend: jest.fn().mockResolvedValue([]),
      cashFlowForecast: jest.fn().mockResolvedValue({ totals: { net: 0 } }),
      portfolio: jest.fn().mockResolvedValue({ summary: {} }),
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

      const result = await service.list(COMPANY_A, USER_1);

      expect(reports.revenueTrend).toHaveBeenCalledWith(COMPANY_A, 6);
      expect(reports.cashFlowForecast).toHaveBeenCalledWith(COMPANY_A);
      expect(result[0].data).toEqual([{ month: "2026-08", revenue: 100 }]);
    });

    it("routes a custom_report widget to CustomReportsService.run using its configured id", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([
        { id: "w-1", type: "custom_report", config: { customReportId: "report-1" } },
      ]);
      customReports.run.mockResolvedValue({ columns: [], rows: [] });

      const result = await service.list(COMPANY_A, USER_1);

      expect(customReports.run).toHaveBeenCalledWith(COMPANY_A, "report-1");
      expect(result[0].data).toEqual({ columns: [], rows: [] });
    });

    it("returns null data for a custom_report widget missing its customReportId, without throwing", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "custom_report", config: null }]);

      const result = await service.list(COMPANY_A, USER_1);

      expect(result[0].data).toBeNull();
      expect(customReports.run).not.toHaveBeenCalled();
    });

    it("swallows a failing widget's data-resolution error rather than failing the whole dashboard", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "revenue_trend", config: null }]);
      reports.revenueTrend.mockRejectedValue(new Error("db down"));

      const result = await service.list(COMPANY_A, USER_1);

      expect(result[0].data).toBeNull();
    });
  });

  describe("create()", () => {
    it("places a new widget after the current highest sortOrder", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue({ sortOrder: 3 });
      prisma.dashboardWidget.create.mockResolvedValue({ id: "w-2" });

      await service.create(COMPANY_A, USER_1, { type: "invoice_aging" });

      expect(prisma.dashboardWidget.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 4 }) }),
      );
    });

    it("starts at sortOrder 0 for a user's first widget", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);
      prisma.dashboardWidget.create.mockResolvedValue({ id: "w-1" });

      await service.create(COMPANY_A, USER_1, { type: "invoice_aging" });

      expect(prisma.dashboardWidget.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
      );
    });
  });

  describe("delete()", () => {
    it("rejects deleting a widget that isn't this user's", async () => {
      prisma.dashboardWidget.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, USER_1, "w-1")).rejects.toThrow(NotFoundException);
      expect(prisma.dashboardWidget.delete).not.toHaveBeenCalled();
    });
  });

  describe("exportPdf()", () => {
    it("renders one table row per widget with a one-line summary", async () => {
      prisma.dashboardWidget.findMany.mockResolvedValue([{ id: "w-1", type: "revenue_trend", config: null }]);
      reports.revenueTrend.mockResolvedValue([{ month: "2026-07", revenue: 50 }, { month: "2026-08", revenue: 100 }]);

      await service.exportPdf(COMPANY_A, USER_1);

      expect(pdf.render).toHaveBeenCalledWith(
        expect.objectContaining({
          tableRows: [{ cells: ["Revenue Trend", "2026-08: 100"] }],
        }),
      );
    });
  });
});
