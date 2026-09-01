import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DailyLogsService } from "./daily-logs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WeatherService } from "../weather/weather.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("DailyLogsService", () => {
  let service: DailyLogsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    dailyLog: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let weather: { forecastForDate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      dailyLog: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    weather = { forecastForDate: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      providers: [
        DailyLogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: WeatherService, useValue: weather },
      ],
    }).compile();

    service = module.get(DailyLogsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          date: "2026-08-20T00:00:00.000Z",
          workPerformed: "Poured footings",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.dailyLog.create).not.toHaveBeenCalled();
    });

    it("rejects a second log for a date that already has one", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.dailyLog.findUnique.mockResolvedValue({ id: "existing-log" });

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          date: "2026-08-20T00:00:00.000Z",
          workPerformed: "Poured footings",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.dailyLog.create).not.toHaveBeenCalled();
    });

    it("normalizes the date to a UTC calendar day and records an audit entry", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
      prisma.dailyLog.findUnique.mockResolvedValue(null);
      prisma.dailyLog.create.mockResolvedValue({ id: "log-1", date: new Date("2026-08-20T00:00:00.000Z") });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T15:42:00.000Z",
        workPerformed: "Poured footings",
      });

      expect(prisma.dailyLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ date: new Date("2026-08-20T00:00:00.000Z"), authorUserId: "user-1", authorName: "Foreman" }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });

    it("auto-fills weather from the forecast when the caller didn't set it and the project has an address", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A", address: "Main St 1, Berlin" });
      prisma.dailyLog.findUnique.mockResolvedValue(null);
      prisma.dailyLog.create.mockResolvedValue({ id: "log-1" });
      weather.forecastForDate.mockResolvedValue({ date: "2026-08-20", condition: "rain", tempMaxC: 18, tempMinC: 10, risky: true });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T00:00:00.000Z",
        workPerformed: "Poured footings",
      });

      expect(weather.forecastForDate).toHaveBeenCalledWith("Main St 1, Berlin", new Date("2026-08-20T00:00:00.000Z"));
      expect(prisma.dailyLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ weatherCondition: "rain" }) }),
      );
    });

    it("doesn't override weather the caller explicitly set", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A", address: "Main St 1, Berlin" });
      prisma.dailyLog.findUnique.mockResolvedValue(null);
      prisma.dailyLog.create.mockResolvedValue({ id: "log-1" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T00:00:00.000Z",
        workPerformed: "Poured footings",
        weatherCondition: "clear",
      });

      expect(weather.forecastForDate).not.toHaveBeenCalled();
      expect(prisma.dailyLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ weatherCondition: "clear" }) }),
      );
    });
  });

  describe("update()", () => {
    it("rejects when the log does not belong to this company", async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, ACTOR, "log-1", { workPerformed: "Updated" })).rejects.toThrow(NotFoundException);
      expect(prisma.dailyLog.update).not.toHaveBeenCalled();
    });
  });

  describe("weatherDelayReport()", () => {
    it("only includes logs with weather delay hours actually recorded, and sums the total", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.dailyLog.findMany.mockResolvedValue([
        { id: "log-1", date: new Date("2026-08-20T00:00:00.000Z"), weatherCondition: "rain", weatherDelayHours: "6", weatherNotes: "Heavy rain" },
        { id: "log-2", date: new Date("2026-08-21T00:00:00.000Z"), weatherCondition: "snow", weatherDelayHours: "8", weatherNotes: null },
      ]);

      const report = await service.weatherDelayReport(COMPANY_A, "project-1");

      expect(prisma.dailyLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ weatherDelayHours: { gt: 0 } }) }),
      );
      expect(report.totalHours).toBe(14);
      expect(report.entries).toHaveLength(2);
    });

    it("rounds the suggested shift up to a whole day for a partial day's worth of lost hours", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.dailyLog.findMany.mockResolvedValue([
        { id: "log-1", date: new Date("2026-08-20T00:00:00.000Z"), weatherCondition: "rain", weatherDelayHours: "9", weatherNotes: null },
      ]);

      const report = await service.weatherDelayReport(COMPANY_A, "project-1");

      // 9 hours / 8-hour workday = 1.125 -> rounds up to 2 whole days, not down to 1.
      expect(report.suggestedShiftDays).toBe(2);
    });

    it("suggests 0 shift days when there's no delay logged at all", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.dailyLog.findMany.mockResolvedValue([]);

      const report = await service.weatherDelayReport(COMPANY_A, "project-1");

      expect(report.suggestedShiftDays).toBe(0);
      expect(report.totalHours).toBe(0);
    });
  });
});
