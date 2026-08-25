import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CustomReportsService } from "./custom-reports.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("CustomReportsService", () => {
  let service: CustomReportsService;
  let prisma: {
    project: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    customReport: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      customReport: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [CustomReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CustomReportsService);
  });

  describe("preview", () => {
    it("returns only the requested columns, in the dataset's canonical order, not raw row data", async () => {
      prisma.project.findMany.mockResolvedValue([
        { name: "Riverside Reno", address: "1 River Rd", handoverDate: null, warrantyMonths: null, createdAt: new Date(), client: { name: "Acme" } },
      ]);

      const result = await service.preview(COMPANY_A, { dataset: "projects", columns: ["address", "name"] });

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
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_A,
            status: "paid",
            createdAt: { gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-12-31T00:00:00.000Z") },
          }),
        }),
      );
    });

    it("silently ignores statusEquals for a dataset with no status field", async () => {
      await service.preview(COMPANY_A, { dataset: "projects", columns: ["name"], statusEquals: "paid" });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.not.objectContaining({ status: expect.anything() }) }),
      );
    });
  });

  describe("run / exportCsv", () => {
    it("throws when the saved report doesn't belong to this company", async () => {
      prisma.customReport.findFirst.mockResolvedValue(null);

      await expect(service.run(COMPANY_A, "report-1")).rejects.toThrow(NotFoundException);
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

      const csv = await service.exportCsv(COMPANY_A, "report-1");

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
