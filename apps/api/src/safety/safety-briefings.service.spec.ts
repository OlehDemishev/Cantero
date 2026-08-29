import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SafetyBriefingsService } from "./safety-briefings.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("SafetyBriefingsService", () => {
  let service: SafetyBriefingsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { count: jest.Mock; findMany: jest.Mock };
    safetyBriefing: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let sms: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      safetyBriefing: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };
    sms = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SafetyBriefingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
      ],
    }).compile();

    service = module.get(SafetyBriefingsService);
  });

  describe("create()", () => {
    it("rejects when the project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", date: "2026-08-20T00:00:00.000Z", topic: "Ladder safety", attendeeWorkerIds: [] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.safetyBriefing.create).not.toHaveBeenCalled();
    });

    it("rejects when an attendee does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        companyId: COMPANY_A,
        name: "Site A",
        company: { workerSmsNotificationsEnabled: false, locale: "en" },
      });
      prisma.worker.count.mockResolvedValue(1);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          date: "2026-08-20T00:00:00.000Z",
          topic: "Ladder safety",
          attendeeWorkerIds: ["worker-1", "worker-2"],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.safetyBriefing.create).not.toHaveBeenCalled();
    });

    it("creates attendance rows for every attendee", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        companyId: COMPANY_A,
        name: "Site A",
        company: { workerSmsNotificationsEnabled: false, locale: "en" },
      });
      prisma.worker.count.mockResolvedValue(2);
      prisma.safetyBriefing.create.mockResolvedValue({ id: "briefing-1" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T00:00:00.000Z",
        topic: "Ladder safety",
        attendeeWorkerIds: ["worker-1", "worker-2"],
      });

      expect(prisma.safetyBriefing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendees: { create: [{ workerId: "worker-1" }, { workerId: "worker-2" }] },
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });

    it("texts attendees with a phone on file when the company has SMS notifications enabled", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        companyId: COMPANY_A,
        name: "Site A",
        company: { workerSmsNotificationsEnabled: true, locale: "en" },
      });
      prisma.worker.count.mockResolvedValue(2);
      prisma.safetyBriefing.create.mockResolvedValue({ id: "briefing-1", date: new Date("2026-08-20T00:00:00.000Z") });
      prisma.worker.findMany.mockResolvedValue([
        { phone: "+15551234567", preferredLocale: "de" },
        { phone: "+15557654321", preferredLocale: null },
      ]);

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T00:00:00.000Z",
        topic: "Ladder safety",
        attendeeWorkerIds: ["worker-1", "worker-2"],
      });

      expect(sms.send).toHaveBeenCalledTimes(2);
      expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: "+15551234567" }));
      expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: "+15557654321" }));
    });

    it("does not text anyone when the company has SMS notifications disabled", async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: "project-1",
        companyId: COMPANY_A,
        name: "Site A",
        company: { workerSmsNotificationsEnabled: false, locale: "en" },
      });
      prisma.worker.count.mockResolvedValue(1);
      prisma.safetyBriefing.create.mockResolvedValue({ id: "briefing-1", date: new Date("2026-08-20T00:00:00.000Z") });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        date: "2026-08-20T00:00:00.000Z",
        topic: "Ladder safety",
        attendeeWorkerIds: ["worker-1"],
      });

      expect(sms.send).not.toHaveBeenCalled();
      expect(prisma.worker.findMany).not.toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("rejects when the briefing does not belong to this company", async () => {
      prisma.safetyBriefing.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, "briefing-1", { topic: "Updated" })).rejects.toThrow(NotFoundException);
      expect(prisma.safetyBriefing.update).not.toHaveBeenCalled();
    });
  });
});
