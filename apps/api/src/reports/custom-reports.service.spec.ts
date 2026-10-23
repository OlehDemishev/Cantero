import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CustomReportsService } from "./custom-reports.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ReportsService } from "./reports.service";
import { LaborCostService } from "../team/labor-cost.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";
const VIEWER = { userId: "user-1", role: "accountant" };

describe("CustomReportsService", () => {
  let service: CustomReportsService;
  let prisma: {
    project: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    customReport: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
    customFieldDefinition: { findMany: jest.Mock };
    customFieldValue: { findMany: jest.Mock };
  };

  let projectAccess: { visibleWhere: jest.Mock };

  beforeEach(async () => {
    projectAccess = { visibleWhere: jest.fn().mockResolvedValue({}) };
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      customReport: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
      customFieldDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      customFieldValue: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [
        CustomReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsService, useValue: {} },
        { provide: LaborCostService, useValue: {} },
        { provide: ProjectAccessService, useValue: projectAccess },
      ],
    }).compile();

    service = module.get(CustomReportsService);
  });

  describe("preview", () => {
    it("returns only the requested columns, in the dataset's canonical order, not raw row data", async () => {
      prisma.project.findMany.mockResolvedValue([
        { name: "Riverside Reno", address: "1 River Rd", handoverDate: null, warrantyMonths: null, createdAt: new Date(), client: { name: "Acme" } },
      ]);

      const result = await service.preview(COMPANY_A, { dataset: "projects", columns: ["address", "name"] }, VIEWER);

      expect(result.columns.map((c) => c.key)).toEqual(["name", "address"]);
      expect(result.rows).toEqual([{ name: "Riverside Reno", address: "1 River Rd" }]);
      expect(result.rows[0]).not.toHaveProperty("client");
    });

    it("passes the date range and status filter through to the dataset query", async () => {
      await service.preview(COMPANY_A, {
        dataset: "invoices",
        columns: ["number", "total"],
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-12-31T00:00:00.000Z",
        statusEquals: "paid",
      }, VIEWER);

      expect(prisma.invoice.findMany.mock.calls[0][0].where.AND[0]).toEqual(
        expect.objectContaining({
          companyId: COMPANY_A,
          status: "paid",
          createdAt: { gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-12-31T00:00:00.000Z") },
        }),
      );
    });

    it("silently ignores statusEquals for a dataset with no status field", async () => {
      await service.preview(COMPANY_A, { dataset: "projects", columns: ["name"], statusEquals: "paid" }, VIEWER);

      expect(prisma.project.findMany.mock.calls[0][0].where.AND[0]).not.toHaveProperty("status");
    });

    it("leaves out rows of projects the viewer can't see", async () => {
      projectAccess.visibleWhere.mockResolvedValue({ projectId: { notIn: ["restricted-1"] } });

      await service.preview(COMPANY_A, { dataset: "invoices", columns: ["number"] }, VIEWER);

      expect(projectAccess.visibleWhere).toHaveBeenCalledWith(COMPANY_A, "Invoice", "user-1", "accountant");
      expect(prisma.invoice.findMany.mock.calls[0][0].where.AND[1]).toEqual({ projectId: { notIn: ["restricted-1"] } });
    });
  });

  describe("run / exportCsv", () => {
    it("throws when the saved report doesn't belong to this company", async () => {
      prisma.customReport.findFirst.mockResolvedValue(null);

      await expect(service.run(COMPANY_A, "report-1", VIEWER)).rejects.toThrow(NotFoundException);
    });

    it("re-runs a saved report's stored definition and renders it as CSV", async () => {
      prisma.customReport.findFirst.mockResolvedValue({
        id: "report-1",
        dataset: "projects",
        columns: ["name", "address"],
        dateFrom: null,
        dateTo: null,
        statusEquals: null,
      });
      prisma.project.findMany.mockResolvedValue([
        { name: "Riverside Reno", address: "1 River Rd", handoverDate: null, warrantyMonths: null, createdAt: new Date(), client: null },
        { name: "Garage Extension", address: null, handoverDate: null, warrantyMonths: null, createdAt: new Date(), client: null },
      ]);

      const csv = await service.exportCsv(COMPANY_A, "report-1", VIEWER);

      expect(csv).toBe('Name,Address\r\nRiverside Reno,1 River Rd\r\nGarage Extension,');
    });
  });

  describe("delete", () => {
    it("throws when the report doesn't belong to this company", async () => {
      prisma.customReport.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, "report-1")).rejects.toThrow(NotFoundException);
      expect(prisma.customReport.delete).not.toHaveBeenCalled();
    });

    it("deletes when found", async () => {
      prisma.customReport.findFirst.mockResolvedValue({ id: "report-1" });

      const result = await service.delete(COMPANY_A, "report-1");

      expect(result).toEqual({ ok: true });
      expect(prisma.customReport.delete).toHaveBeenCalledWith({ where: { id: "report-1" } });
    });
  });
});
