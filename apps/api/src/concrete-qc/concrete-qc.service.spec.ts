import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConcreteQcService } from "./concrete-qc.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "QC Inspector" };

describe("ConcreteQcService", () => {
  let service: ConcreteQcService;
  let prisma: {
    project: { findFirst: jest.Mock };
    concretePour: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    slumpTest: { create: jest.Mock };
    cylinderBreak: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      concretePour: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      slumpTest: { create: jest.fn() },
      cylinderBreak: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [ConcreteQcService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(ConcreteQcService);
  });

  describe("createPour()", () => {
    it("rejects a pour for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.createPour(COMPANY_A, ACTOR, "project-1", { location: "Grid B2", pourDate: "2026-06-01T00:00:00.000Z" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("addSlumpTest()", () => {
    it("throws when the pour doesn't belong to the company", async () => {
      prisma.concretePour.findFirst.mockResolvedValue(null);
      await expect(
        service.addSlumpTest(COMPANY_A, "pour-1", { slumpValue: 4, withinSpec: true, testedByName: "Jane" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("records the tester's explicit withinSpec judgment as given, not derived", async () => {
      prisma.concretePour.findFirst.mockResolvedValue({ id: "pour-1" });
      prisma.slumpTest.create.mockResolvedValue({ id: "test-1", withinSpec: false });

      await service.addSlumpTest(COMPANY_A, "pour-1", { slumpValue: 7, withinSpec: false, testedByName: "Jane" });

      expect(prisma.slumpTest.create).toHaveBeenCalledWith({
        data: { pourId: "pour-1", slumpValue: 7, withinSpec: false, testedByName: "Jane", notes: undefined },
      });
    });
  });

  describe("recordCylinderBreakResult()", () => {
    it("throws when the cylinder break doesn't belong to the company", async () => {
      prisma.cylinderBreak.findFirst.mockResolvedValue(null);
      await expect(
        service.recordCylinderBreakResult(COMPANY_A, ACTOR, "break-1", { breakStrength: 4000, testedByName: "Jane" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("classifies pass when break strength meets the pour's specified strength", async () => {
      prisma.cylinderBreak.findFirst.mockResolvedValue({ id: "break-1", cylinderLabel: "1 of 4", pour: { specifiedStrength: "4000" } });
      prisma.cylinderBreak.update.mockResolvedValue({ id: "break-1", result: "pass" });

      await service.recordCylinderBreakResult(COMPANY_A, ACTOR, "break-1", { breakStrength: 4200, testedByName: "Jane" });

      expect(prisma.cylinderBreak.update).toHaveBeenCalledWith({
        where: { id: "break-1" },
        data: { breakStrength: 4200, result: "pass", testedByName: "Jane", notes: undefined },
      });
    });

    it("classifies fail when break strength is below the pour's specified strength", async () => {
      prisma.cylinderBreak.findFirst.mockResolvedValue({ id: "break-1", cylinderLabel: "1 of 4", pour: { specifiedStrength: "4000" } });
      prisma.cylinderBreak.update.mockResolvedValue({ id: "break-1", result: "fail" });

      await service.recordCylinderBreakResult(COMPANY_A, ACTOR, "break-1", { breakStrength: 3500, testedByName: "Jane" });

      const updateCall = prisma.cylinderBreak.update.mock.calls[0][0];
      expect(updateCall.data.result).toBe("fail");
    });

    it("leaves result unset when the pour has no specified strength", async () => {
      prisma.cylinderBreak.findFirst.mockResolvedValue({ id: "break-1", cylinderLabel: "1 of 4", pour: { specifiedStrength: null } });
      prisma.cylinderBreak.update.mockResolvedValue({ id: "break-1", result: null });

      await service.recordCylinderBreakResult(COMPANY_A, ACTOR, "break-1", { breakStrength: 3500, testedByName: "Jane" });

      const updateCall = prisma.cylinderBreak.update.mock.calls[0][0];
      expect(updateCall.data.result).toBeUndefined();
    });
  });
});
