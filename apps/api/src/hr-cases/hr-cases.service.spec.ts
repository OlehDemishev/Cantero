import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { HrCasesService } from "./hr-cases.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("HrCasesService", () => {
  let service: HrCasesService;
  let prisma: {
    hrCase: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    hrCaseAction: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    worker: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      hrCase: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      hrCaseAction: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      worker: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        HrCasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(HrCasesService);
  });

  describe("openCase()", () => {
    it("rejects a worker who doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.openCase(COMPANY_A, { name: "Manager" }, "worker-1", { category: "attendance", description: "Three no-shows" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("opens a case with the reporting manager's name attached", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.hrCase.create.mockResolvedValue({ id: "case-1" });

      await service.openCase(COMPANY_A, { name: "Manager" }, "worker-1", { category: "attendance", description: "Three no-shows" });

      const call = prisma.hrCase.create.mock.calls[0][0];
      expect(call.data.reporterName).toBe("Manager");
      expect(call.data.workerId).toBe("worker-1");
    });
  });

  describe("updateStatus()", () => {
    it("rejects changing the status of an already-closed case", async () => {
      prisma.hrCase.findFirst.mockResolvedValue({ id: "case-1", status: "closed" });

      await expect(service.updateStatus(COMPANY_A, { name: "Manager" }, "case-1", { status: "investigating" })).rejects.toThrow(BadRequestException);
    });

    it("stamps closedAt when moving to closed", async () => {
      prisma.hrCase.findFirst.mockResolvedValue({ id: "case-1", status: "resolved" });
      prisma.hrCase.update.mockResolvedValue({ id: "case-1", status: "closed" });

      await service.updateStatus(COMPANY_A, { name: "Manager" }, "case-1", { status: "closed" });

      const call = prisma.hrCase.update.mock.calls[0][0];
      expect(call.data.closedAt).toBeInstanceOf(Date);
    });
  });

  describe("acknowledgeAction()", () => {
    it("rejects acknowledging an action twice", async () => {
      prisma.hrCaseAction.findFirst.mockResolvedValue({ id: "action-1", acknowledgedAt: new Date() });

      await expect(service.acknowledgeAction(COMPANY_A, { name: "Manager" }, "action-1")).rejects.toThrow(BadRequestException);
    });

    it("stamps acknowledgedAt on an unacknowledged action", async () => {
      prisma.hrCaseAction.findFirst.mockResolvedValue({ id: "action-1", acknowledgedAt: null });
      prisma.hrCaseAction.update.mockResolvedValue({ id: "action-1", acknowledgedAt: new Date() });

      const result = await service.acknowledgeAction(COMPANY_A, { name: "Manager" }, "action-1");

      expect(result.acknowledgedAt).toBeInstanceOf(Date);
    });
  });
});
