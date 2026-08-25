import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TimeOffService } from "./time-off.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "admin-1", name: "Admin" };

describe("TimeOffService", () => {
  let service: TimeOffService;
  let prisma: {
    worker: { findFirst: jest.Mock };
    timeOffRequest: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      worker: { findFirst: jest.fn() },
      timeOffRequest: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [TimeOffService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(TimeOffService);
  });

  describe("create", () => {
    it("rejects a worker from another company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, {
          workerId: "worker-1",
          type: "vacation",
          startDate: "2026-06-01T00:00:00.000Z",
          endDate: "2026-06-05T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an endDate before startDate", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Sam" });

      await expect(
        service.create(COMPANY_A, ACTOR, {
          workerId: "worker-1",
          type: "vacation",
          startDate: "2026-06-05T00:00:00.000Z",
          endDate: "2026-06-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.timeOffRequest.create).not.toHaveBeenCalled();
    });

    it("creates a pending request and audits it", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Sam" });
      prisma.timeOffRequest.create.mockResolvedValue({ id: "req-1", status: "pending" });

      await service.create(COMPANY_A, ACTOR, {
        workerId: "worker-1",
        type: "sick",
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-06-02T00:00:00.000Z",
      });

      expect(prisma.timeOffRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_A, workerId: "worker-1", type: "sick" }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "time_off.requested",
        "TimeOffRequest",
        "req-1",
        expect.stringContaining("Sam"),
      );
    });
  });

  describe("decide", () => {
    it("throws when the request doesn't exist in this company", async () => {
      prisma.timeOffRequest.findFirst.mockResolvedValue(null);

      await expect(service.decide(COMPANY_A, ACTOR, "req-1", { approve: true })).rejects.toThrow(NotFoundException);
    });

    it("refuses to re-decide an already-decided request", async () => {
      prisma.timeOffRequest.findFirst.mockResolvedValue({ id: "req-1", status: "approved", worker: { name: "Sam" } });

      await expect(service.decide(COMPANY_A, ACTOR, "req-1", { approve: false })).rejects.toThrow(BadRequestException);
      expect(prisma.timeOffRequest.update).not.toHaveBeenCalled();
    });

    it("approves a pending request and records who decided it", async () => {
      prisma.timeOffRequest.findFirst.mockResolvedValue({ id: "req-1", status: "pending", worker: { name: "Sam" } });
      prisma.timeOffRequest.update.mockResolvedValue({ id: "req-1", status: "approved" });

      await service.decide(COMPANY_A, ACTOR, "req-1", { approve: true });

      expect(prisma.timeOffRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req-1" },
          data: expect.objectContaining({ status: "approved", decidedByUserId: ACTOR.userId }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        COMPANY_A,
        ACTOR,
        "time_off.approved",
        "TimeOffRequest",
        "req-1",
        expect.stringContaining("Approved"),
      );
    });
  });
});
