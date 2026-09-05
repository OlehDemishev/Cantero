import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommissioningService } from "./commissioning.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("CommissioningService", () => {
  let service: CommissioningService;
  let prisma: {
    project: { findFirst: jest.Mock };
    commissioningSystem: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock; update: jest.Mock };
    commissioningChecklistItem: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    functionalTest: { create: jest.Mock };
    ownerTrainingSession: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      commissioningSystem: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      commissioningChecklistItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      functionalTest: { create: jest.fn() },
      ownerTrainingSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        CommissioningService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(CommissioningService);
  });

  describe("createSystem()", () => {
    it("rejects a system for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.createSystem(COMPANY_A, ACTOR, "project-1", { name: "AHU-1" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("addFunctionalTest()", () => {
    it("throws when the system doesn't belong to the company", async () => {
      prisma.commissioningSystem.findFirst.mockResolvedValue(null);
      await expect(
        service.addFunctionalTest(COMPANY_A, ACTOR, "system-1", { procedure: "Airflow check", result: "pass", testedByName: "Jane" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("recomputes status to testing after a failed test", async () => {
      prisma.commissioningSystem.findFirst.mockResolvedValue({ id: "system-1", name: "AHU-1", status: "pending_testing" });
      prisma.functionalTest.create.mockResolvedValue({ id: "test-1" });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "pending_testing",
        checklistItems: [],
        functionalTests: [{ result: "fail", testedAt: new Date("2026-01-01") }],
        trainingSessions: [],
      });

      await service.addFunctionalTest(COMPANY_A, ACTOR, "system-1", { procedure: "Airflow check", result: "fail", testedByName: "Jane" });

      expect(prisma.commissioningSystem.update).toHaveBeenCalledWith({ where: { id: "system-1" }, data: { status: "testing" } });
    });

    it("recomputes status to complete once checklist is done, the latest test passes, and training is signed off", async () => {
      prisma.commissioningSystem.findFirst.mockResolvedValue({ id: "system-1", name: "AHU-1", status: "testing" });
      prisma.functionalTest.create.mockResolvedValue({ id: "test-1" });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "testing",
        checklistItems: [{ done: true }],
        functionalTests: [{ result: "pass", testedAt: new Date("2026-01-01") }],
        trainingSessions: [{ ownerSignedOffAt: new Date() }],
      });

      await service.addFunctionalTest(COMPANY_A, ACTOR, "system-1", { procedure: "Airflow check", result: "pass", testedByName: "Jane" });

      expect(prisma.commissioningSystem.update).toHaveBeenCalledWith({ where: { id: "system-1" }, data: { status: "complete" } });
    });

    it("does not write an update when the recomputed status matches the current one", async () => {
      prisma.commissioningSystem.findFirst.mockResolvedValue({ id: "system-1", name: "AHU-1", status: "testing" });
      prisma.functionalTest.create.mockResolvedValue({ id: "test-1" });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "testing",
        checklistItems: [{ done: false }],
        functionalTests: [{ result: "pass", testedAt: new Date("2026-01-01") }],
        trainingSessions: [],
      });

      await service.addFunctionalTest(COMPANY_A, ACTOR, "system-1", { procedure: "Airflow check", result: "pass", testedByName: "Jane" });

      expect(prisma.commissioningSystem.update).not.toHaveBeenCalled();
    });

    it("recomputes to complete once a later retest passes, even though an earlier attempt failed", async () => {
      prisma.commissioningSystem.findFirst.mockResolvedValue({ id: "system-1", name: "AHU-1", status: "testing" });
      prisma.functionalTest.create.mockResolvedValue({ id: "test-2" });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "testing",
        checklistItems: [{ done: true }],
        functionalTests: [
          { result: "fail", testedAt: new Date("2026-01-01") },
          { result: "pass", testedAt: new Date("2026-01-02") },
        ],
        trainingSessions: [],
      });

      await service.addFunctionalTest(COMPANY_A, ACTOR, "system-1", { procedure: "Airflow check", result: "pass", testedByName: "Jane" });

      expect(prisma.commissioningSystem.update).toHaveBeenCalledWith({ where: { id: "system-1" }, data: { status: "complete" } });
    });
  });

  describe("signOffOwnerTraining()", () => {
    it("throws when the training session doesn't belong to the company", async () => {
      prisma.ownerTrainingSession.findFirst.mockResolvedValue(null);
      await expect(service.signOffOwnerTraining(COMPANY_A, ACTOR, "session-1", { ownerSignerName: "Owner Rep" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("stamps ownerSignedOffAt and signer name", async () => {
      prisma.ownerTrainingSession.findFirst.mockResolvedValue({ id: "session-1", systemId: "system-1", system: { name: "AHU-1" } });
      prisma.ownerTrainingSession.update.mockResolvedValue({ id: "session-1", ownerSignedOffAt: new Date() });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "testing",
        checklistItems: [],
        functionalTests: [],
        trainingSessions: [{ ownerSignedOffAt: new Date() }],
      });

      const result = await service.signOffOwnerTraining(COMPANY_A, ACTOR, "session-1", { ownerSignerName: "Owner Rep" });

      expect(result.ownerSignedOffAt).toBeTruthy();
      const updateCall = prisma.ownerTrainingSession.update.mock.calls[0][0];
      expect(updateCall.data.ownerSignerName).toBe("Owner Rep");
    });
  });

  describe("toggleChecklistItem()", () => {
    it("throws when the item doesn't belong to the company", async () => {
      prisma.commissioningChecklistItem.findFirst.mockResolvedValue(null);
      await expect(service.toggleChecklistItem(COMPANY_A, "item-1", "Jane")).rejects.toThrow(NotFoundException);
    });

    it("marks an undone item done, stamping completedAt and completedByName", async () => {
      prisma.commissioningChecklistItem.findFirst.mockResolvedValue({ id: "item-1", systemId: "system-1", done: false });
      prisma.commissioningChecklistItem.update.mockResolvedValue({ id: "item-1", done: true });
      prisma.commissioningSystem.findUniqueOrThrow.mockResolvedValue({
        id: "system-1",
        status: "pending_testing",
        checklistItems: [{ done: true }],
        functionalTests: [],
        trainingSessions: [],
      });

      await service.toggleChecklistItem(COMPANY_A, "item-1", "Jane");

      const updateCall = prisma.commissioningChecklistItem.update.mock.calls[0][0];
      expect(updateCall.data.done).toBe(true);
      expect(updateCall.data.completedByName).toBe("Jane");
    });
  });
});
