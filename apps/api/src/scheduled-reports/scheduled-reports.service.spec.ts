import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { ReportsService } from "../reports/reports.service";
import { SCHEDULED_REPORTS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

describe("ScheduledReportsService", () => {
  let service: ScheduledReportsService;
  let prisma: {
    scheduledReport: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let reports: { overview: jest.Mock; cashFlowForecast: jest.Mock };

  beforeEach(async () => {
    prisma = {
      scheduledReport: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: COMPANY_A, currency: "EUR" }) },
    };
    mail = { send: jest.fn() };
    reports = { overview: jest.fn(), cashFlowForecast: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ScheduledReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ReportsService, useValue: reports },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(SCHEDULED_REPORTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(ScheduledReportsService);
  });

  describe("create()", () => {
    it("schedules the first run one interval ahead rather than immediately", async () => {
      prisma.scheduledReport.create.mockResolvedValue({ id: "sr-1" });

      await service.create(COMPANY_A, {
        name: "Weekly overview",
        reportType: "overview",
        frequency: "weekly",
        recipientEmails: ["owner@example.com"],
      });

      const callArg = prisma.scheduledReport.create.mock.calls[0][0];
      const nextRunAt: Date = callArg.data.nextRunAt;
      expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("delete()", () => {
    it("rejects a report that doesn't belong to this company", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, "sr-1")).rejects.toThrow(NotFoundException);
      expect(prisma.scheduledReport.delete).not.toHaveBeenCalled();
    });
  });

  describe("sendNow()", () => {
    it("emails every recipient with headline numbers but does not touch the schedule", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue({
        id: "sr-1",
        companyId: COMPANY_A,
        name: "Weekly overview",
        reportType: "overview",
        recipientEmails: ["a@example.com", "b@example.com"],
      });
      reports.overview.mockResolvedValue({
        projectsTotal: 5,
        estimates: { total: 10, draft: 2, approved: 8 },
        invoices: { total: 4, totalValue: 12000, paidValue: 8000, outstandingValue: 4000 },
        clients: { total: 3, won: 2 },
        workersTotal: 6,
        materials: { stockValue: 900, lowStockCount: 1 },
      });

      await service.sendNow(COMPANY_A, "sr-1");

      expect(mail.send).toHaveBeenCalledTimes(2);
      const [firstCall] = mail.send.mock.calls;
      expect(firstCall[0].to).toBe("a@example.com");
      expect(firstCall[0].html).toContain("12000 EUR");
      expect(firstCall[0].subject).toContain("Weekly overview");
      expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
  });

  describe("runDuePass()", () => {
    it("sends each due report, advances nextRunAt, and sets lastSentAt", async () => {
      const originalNextRunAt = new Date(Date.now() - 60_000);
      prisma.scheduledReport.findMany.mockResolvedValue([
        {
          id: "sr-1",
          companyId: COMPANY_A,
          name: "Weekly overview",
          reportType: "overview",
          frequency: "weekly",
          nextRunAt: originalNextRunAt,
          recipientEmails: ["owner@example.com"],
        },
      ]);
      reports.overview.mockResolvedValue({
        projectsTotal: 1,
        estimates: { total: 1, draft: 0, approved: 1 },
        invoices: { total: 1, totalValue: 100, paidValue: 100, outstandingValue: 0 },
        clients: { total: 1, won: 1 },
        workersTotal: 1,
        materials: { stockValue: 0, lowStockCount: 0 },
      });

      const result = await service.runDuePass();

      expect(result.sent).toBe(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
      const updateArg = prisma.scheduledReport.update.mock.calls[0][0];
      expect(updateArg.data.nextRunAt.getTime()).toBeGreaterThan(originalNextRunAt.getTime());
      expect(updateArg.data.lastSentAt).toBeInstanceOf(Date);
    });

    it("still advances the schedule even if sending fails, so a broken report can't stall forever", async () => {
      prisma.scheduledReport.findMany.mockResolvedValue([
        {
          id: "sr-1",
          companyId: COMPANY_A,
          name: "Broken report",
          reportType: "overview",
          frequency: "weekly",
          nextRunAt: new Date(Date.now() - 60_000),
          recipientEmails: ["owner@example.com"],
        },
      ]);
      reports.overview.mockRejectedValue(new Error("boom"));

      const result = await service.runDuePass();

      expect(result.sent).toBe(0);
      expect(prisma.scheduledReport.update).toHaveBeenCalledTimes(1);
    });
  });
});
