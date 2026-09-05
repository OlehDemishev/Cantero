import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SafetyObservationsService } from "./safety-observations.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("SafetyObservationsService", () => {
  let service: SafetyObservationsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    safetyObservation: { findMany: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      safetyObservation: { findMany: jest.fn(), create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [SafetyObservationsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(SafetyObservationsService);
  });

  describe("create()", () => {
    it("rejects an observation for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "project-1", category: "safe", behaviorObserved: "Wore harness at height" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates an observation and audits it", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", name: "Site A" });
      prisma.safetyObservation.create.mockResolvedValue({ id: "obs-1" });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", category: "at_risk", behaviorObserved: "No harness at height", correctiveAction: "Stopped work, re-briefed" });

      expect(prisma.safetyObservation.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "safety_observation.logged", "SafetyObservation", "obs-1", expect.any(String));
    });
  });

  describe("rateByYear()", () => {
    it("computes overall rate and a monthly trend", async () => {
      prisma.safetyObservation.findMany.mockResolvedValue([
        { category: "safe", observedAt: new Date("2026-08-01T00:00:00Z") },
        { category: "at_risk", observedAt: new Date("2026-08-15T00:00:00Z") },
        { category: "safe", observedAt: new Date("2026-09-01T00:00:00Z") },
      ]);

      const result = await service.rateByYear(COMPANY_A, 2026);

      expect(result.totalCount).toBe(3);
      expect(result.safeCount).toBe(2);
      expect(result.monthlyTrend.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    });
  });
});
