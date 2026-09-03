import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PerformanceService } from "./performance.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("PerformanceService", () => {
  let service: PerformanceService;
  let prisma: {
    performanceReviewCycle: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    performanceReview: { findMany: jest.Mock; upsert: jest.Mock };
    performanceGoal: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      performanceReviewCycle: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      performanceReview: { findMany: jest.fn(), upsert: jest.fn() },
      performanceGoal: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        PerformanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(PerformanceService);
  });

  describe("closeCycle()", () => {
    it("rejects closing an already-closed cycle", async () => {
      prisma.performanceReviewCycle.findFirst.mockResolvedValue({ id: "cycle-1", status: "closed", name: "H1 2026" });

      await expect(service.closeCycle(COMPANY_A, { name: "Owner" }, "cycle-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("submitReview()", () => {
    it("rejects submitting a review for a closed cycle", async () => {
      prisma.performanceReviewCycle.findFirst.mockResolvedValue({ id: "cycle-1", status: "closed", name: "H1 2026" });

      await expect(
        service.submitReview(COMPANY_A, { name: "Manager" }, "cycle-1", { workerId: "w1" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a worker who doesn't belong to the company", async () => {
      prisma.performanceReviewCycle.findFirst.mockResolvedValue({ id: "cycle-1", status: "open", name: "H1 2026" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.submitReview(COMPANY_A, { name: "Manager" }, "cycle-1", { workerId: "w1" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("upserts a review keyed by cycle+worker and leaves submittedAt unset for a draft", async () => {
      prisma.performanceReviewCycle.findFirst.mockResolvedValue({ id: "cycle-1", status: "open", name: "H1 2026" });
      prisma.worker.findFirst.mockResolvedValue({ id: "w1", name: "Jane" });
      prisma.performanceReview.upsert.mockResolvedValue({ id: "review-1" });

      await service.submitReview(COMPANY_A, { name: "Manager" }, "cycle-1", { workerId: "w1", rating: "meets_expectations" });

      const call = prisma.performanceReview.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ cycleId_workerId: { cycleId: "cycle-1", workerId: "w1" } });
      expect(call.create.submittedAt).toBeUndefined();
    });

    it("stamps submittedAt when submit: true", async () => {
      prisma.performanceReviewCycle.findFirst.mockResolvedValue({ id: "cycle-1", status: "open", name: "H1 2026" });
      prisma.worker.findFirst.mockResolvedValue({ id: "w1", name: "Jane" });
      prisma.performanceReview.upsert.mockResolvedValue({ id: "review-1" });

      await service.submitReview(COMPANY_A, { name: "Manager" }, "cycle-1", { workerId: "w1", submit: true });

      const call = prisma.performanceReview.upsert.mock.calls[0][0];
      expect(call.create.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe("updateGoalProgress()", () => {
    it("stamps completedAt once progress reaches 100%", async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({ id: "goal-1", title: "Get OSHA 30" });
      prisma.performanceGoal.update.mockResolvedValue({ id: "goal-1", progressPercent: 100 });

      await service.updateGoalProgress(COMPANY_A, { name: "Manager" }, "goal-1", { progressPercent: 100 });

      const call = prisma.performanceGoal.update.mock.calls[0][0];
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });

    it("clears completedAt when progress drops back below 100%", async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({ id: "goal-1", title: "Get OSHA 30" });
      prisma.performanceGoal.update.mockResolvedValue({ id: "goal-1", progressPercent: 80 });

      await service.updateGoalProgress(COMPANY_A, { name: "Manager" }, "goal-1", { progressPercent: 80 });

      const call = prisma.performanceGoal.update.mock.calls[0][0];
      expect(call.data.completedAt).toBeNull();
    });
  });
});
