import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DailyLogsService } from "./daily-logs.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("DailyLogsService", () => {
  let service: DailyLogsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    dailyLog: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      dailyLog: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DailyLogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
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
  });

  describe("update()", () => {
    it("rejects when the log does not belong to this company", async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, ACTOR, "log-1", { workPerformed: "Updated" })).rejects.toThrow(NotFoundException);
      expect(prisma.dailyLog.update).not.toHaveBeenCalled();
    });
  });
});
