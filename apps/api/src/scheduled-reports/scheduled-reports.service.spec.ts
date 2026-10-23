import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { NO_AUTHOR_VIEWER, ScheduledReportsService } from "./scheduled-reports.service";
import { PermissionsService } from "../common/permissions/permissions.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { ReportsService } from "../reports/reports.service";
import { SCHEDULED_REPORTS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";
const ACCOUNTANT = { userId: "user-acc", companyId: COMPANY_A, role: "accountant", permissions: ["finance.view", "reports.custom"] } as unknown as AuthUser;
const MARGINS_REPORT = {
  id: "sr-1",
  companyId: COMPANY_A,
  name: "Margins",
  reportType: "project_margins",
  recipientEmails: ["a@example.com"],
  createdById: "user-acc",
};

describe("ScheduledReportsService", () => {
  let service: ScheduledReportsService;
  let prisma: {
    scheduledReport: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    membership: { findUnique: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let reports: { overview: jest.Mock; cashFlowForecast: jest.Mock; projectMargins: jest.Mock };
  let permissions: { effectiveFor: jest.Mock };

  beforeEach(async () => {
    prisma = {
      scheduledReport: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: COMPANY_A, currency: "EUR" }) },
      membership: { findUnique: jest.fn().mockResolvedValue({ role: "accountant", customRole: null }) },
    };
    mail = { send: jest.fn() };
    reports = { overview: jest.fn(), cashFlowForecast: jest.fn(), projectMargins: jest.fn().mockResolvedValue([]) };
    permissions = { effectiveFor: jest.fn().mockResolvedValue(["finance.view", "reports.custom"]) };

    const module = await Test.createTestingModule({
      providers: [
        ScheduledReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ReportsService, useValue: reports },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: PermissionsService, useValue: permissions },
        { provide: getQueueToken(SCHEDULED_REPORTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(ScheduledReportsService);
  });

  describe("create()", () => {
    it("schedules the first run one interval ahead rather than immediately", async () => {
      prisma.scheduledReport.create.mockResolvedValue({ id: "sr-1" });

      await service.create(COMPANY_A, ACCOUNTANT, {
        name: "Weekly overview",
        reportType: "overview",
        frequency: "weekly",
        recipientEmails: ["owner@example.com"],
      });

      const callArg = prisma.scheduledReport.create.mock.calls[0][0];
      const nextRunAt: Date = callArg.data.nextRunAt;
      expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
      expect(callArg.data.createdById).toBe("user-acc");
    });

    it("refuses to schedule a report its author can't open", async () => {
      const foreman = { ...ACCOUNTANT, permissions: ["reports.custom"] } as unknown as AuthUser;

      expect(() =>
        service.create(COMPANY_A, foreman, { name: "Margins", reportType: "project_margins", frequency: "weekly", recipientEmails: ["x@example.com"] }),
      ).toThrow(ForbiddenException);
      expect(prisma.scheduledReport.create).not.toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("hands the report over to whoever changes it, so editing recipients can't borrow someone else's view", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue({ ...MARGINS_REPORT, createdById: "owner-1" });

      await service.update(COMPANY_A, ACCOUNTANT, "sr-1", { recipientEmails: ["me@example.com"] });

      expect(prisma.scheduledReport.update.mock.calls[0][0].data.createdById).toBe("user-acc");
    });
  });

  describe("restricted projects", () => {
    it("computes the report as its author, with their current role", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(MARGINS_REPORT);

      await service.sendNow(COMPANY_A, "sr-1");

      expect(reports.projectMargins).toHaveBeenCalledWith(COMPANY_A, { userId: "user-acc", role: "accountant" });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it("runs a report with no recorded author as a viewer that sees no restricted project", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue({ ...MARGINS_REPORT, createdById: null });

      await service.sendNow(COMPANY_A, "sr-1");

      expect(reports.projectMargins).toHaveBeenCalledWith(COMPANY_A, NO_AUTHOR_VIEWER);
      expect(NO_AUTHOR_VIEWER.role).not.toMatch(/^(owner|admin)$/);
    });

    it("treats an author who left the company like a missing one", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(MARGINS_REPORT);
      prisma.membership.findUnique.mockResolvedValue(null);

      await service.sendNow(COMPANY_A, "sr-1");

      expect(reports.projectMargins).toHaveBeenCalledWith(COMPANY_A, NO_AUTHOR_VIEWER);
    });

    it("doesn't send once the author has lost access to the report", async () => {
      prisma.scheduledReport.findFirst.mockResolvedValue(MARGINS_REPORT);
      permissions.effectiveFor.mockResolvedValue(["reports.custom"]);

      await expect(service.sendNow(COMPANY_A, "sr-1")).rejects.toThrow(ForbiddenException);
      expect(reports.projectMargins).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
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
      expect(String(firstCall[0].html)).toContain("12000 EUR");
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
