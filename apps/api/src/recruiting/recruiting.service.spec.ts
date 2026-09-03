import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RecruitingService } from "./recruiting.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { WorkersService } from "../team/workers.service";

const COMPANY_A = "company-a";

describe("RecruitingService", () => {
  let service: RecruitingService;
  let prisma: {
    jobPosting: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    candidate: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    interview: { findMany: jest.Mock; create: jest.Mock };
  };
  let workers: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      jobPosting: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      candidate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      interview: { findMany: jest.fn(), create: jest.fn() },
    };
    workers = { create: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RecruitingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: WorkersService, useValue: workers },
      ],
    }).compile();

    service = module.get(RecruitingService);
  });

  describe("moveStage()", () => {
    it("rejects moving a candidate who is already hired", async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: "cand-1", name: "Jane", stage: "hired" });

      await expect(service.moveStage(COMPANY_A, { name: "Owner" }, "cand-1", { stage: "rejected" })).rejects.toThrow(BadRequestException);
    });

    it("moves a candidate to a new stage", async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: "cand-1", name: "Jane", stage: "applied" });
      prisma.candidate.update.mockResolvedValue({ id: "cand-1", stage: "screening" });

      const result = await service.moveStage(COMPANY_A, { name: "Owner" }, "cand-1", { stage: "screening" });

      expect(result.stage).toBe("screening");
    });
  });

  describe("convertToWorker()", () => {
    it("rejects converting a candidate who was already converted", async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: "cand-1", name: "Jane", hiredWorkerId: "worker-1" });

      await expect(service.convertToWorker(COMPANY_A, { name: "Owner" }, "cand-1", {})).rejects.toThrow(BadRequestException);
      expect(workers.create).not.toHaveBeenCalled();
    });

    it("creates a worker via WorkersService and links it back to the candidate", async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: "cand-1", name: "Jane", phone: "555-1234", hiredWorkerId: null });
      workers.create.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.candidate.update.mockResolvedValue({ id: "cand-1", stage: "hired", hiredWorkerId: "worker-1" });

      const result = await service.convertToWorker(COMPANY_A, { name: "Owner" }, "cand-1", { role: "Electrician", hourlyCost: 28 });

      expect(result.id).toBe("worker-1");
      expect(workers.create).toHaveBeenCalledWith(COMPANY_A, {
        name: "Jane",
        role: "Electrician",
        hourlyCost: 28,
        phone: "555-1234",
      });
      const updateCall = prisma.candidate.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ stage: "hired", hiredWorkerId: "worker-1" });
    });
  });

  describe("createCandidate()", () => {
    it("rejects a candidate for a job posting that doesn't belong to the company", async () => {
      prisma.jobPosting.findFirst.mockResolvedValue(null);

      await expect(
        service.createCandidate(COMPANY_A, { name: "Owner" }, "posting-1", { name: "Jane" }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
