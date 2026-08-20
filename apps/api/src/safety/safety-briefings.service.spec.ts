import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SafetyBriefingsService } from "./safety-briefings.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("SafetyBriefingsService", () => {
  let service: SafetyBriefingsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { count: jest.Mock };
    safetyBriefing: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { count: jest.fn() },
      safetyBriefing: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SafetyBriefingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
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
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
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
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A, name: "Site A" });
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
  });

  describe("update()", () => {
    it("rejects when the briefing does not belong to this company", async () => {
      prisma.safetyBriefing.findFirst.mockResolvedValue(null);

      await expect(service.update(COMPANY_A, "briefing-1", { topic: "Updated" })).rejects.toThrow(NotFoundException);
      expect(prisma.safetyBriefing.update).not.toHaveBeenCalled();
    });
  });
});
