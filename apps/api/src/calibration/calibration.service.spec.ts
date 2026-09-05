import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CalibrationService } from "./calibration.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("CalibrationService", () => {
  let service: CalibrationService;
  let prisma: {
    toolCribItem: { findFirst: jest.Mock; findMany: jest.Mock };
    equipment: { findFirst: jest.Mock; findMany: jest.Mock };
    calibrationRecord: { create: jest.Mock; findMany: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      toolCribItem: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      equipment: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      calibrationRecord: { create: jest.fn(), findMany: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [CalibrationService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(CalibrationService);
  });

  describe("log()", () => {
    it("throws when neither toolCribItemId nor equipmentId is provided", async () => {
      await expect(
        service.log(COMPANY_A, ACTOR, { calibratedAt: "2026-01-01T00:00:00.000Z", nextDueAt: "2027-01-01T00:00:00.000Z" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws when the tool crib item doesn't belong to the company", async () => {
      prisma.toolCribItem.findFirst.mockResolvedValue(null);
      await expect(
        service.log(COMPANY_A, ACTOR, {
          toolCribItemId: "tool-1",
          calibratedAt: "2026-01-01T00:00:00.000Z",
          nextDueAt: "2027-01-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("logs a calibration for equipment", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", name: "Total Station" });
      prisma.calibrationRecord.create.mockResolvedValue({ id: "cal-1" });

      await service.log(COMPANY_A, ACTOR, {
        equipmentId: "eq-1",
        calibratedAt: "2026-01-01T00:00:00.000Z",
        nextDueAt: "2027-01-01T00:00:00.000Z",
        certificateNumber: "CERT-001",
      });

      expect(prisma.calibrationRecord.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_A,
          toolCribItemId: undefined,
          equipmentId: "eq-1",
          calibratedAt: new Date("2026-01-01T00:00:00.000Z"),
          nextDueAt: new Date("2027-01-01T00:00:00.000Z"),
          certificateNumber: "CERT-001",
          performedBy: undefined,
          notes: undefined,
        },
      });
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "calibration.logged", "CalibrationRecord", "cal-1", expect.any(String));
    });
  });

  describe("dueList()", () => {
    it("only includes items whose latest calibration is due within the window", async () => {
      const now = Date.now();
      prisma.toolCribItem.findMany.mockResolvedValue([
        { id: "tool-1", name: "Torque Wrench", calibrationRecords: [{ nextDueAt: new Date(now + 5 * 86400000) }] },
        { id: "tool-2", name: "Gas Detector", calibrationRecords: [{ nextDueAt: new Date(now + 90 * 86400000) }] },
      ]);
      prisma.equipment.findMany.mockResolvedValue([]);

      const result = await service.dueList(COMPANY_A, 30);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tool-1");
    });

    it("flags a record whose nextDueAt is already in the past as overdue", async () => {
      const now = Date.now();
      prisma.toolCribItem.findMany.mockResolvedValue([
        { id: "tool-1", name: "Torque Wrench", calibrationRecords: [{ nextDueAt: new Date(now - 5 * 86400000) }] },
      ]);
      prisma.equipment.findMany.mockResolvedValue([]);

      const result = await service.dueList(COMPANY_A, 30);

      expect(result[0].overdue).toBe(true);
    });

    it("sorts by nearest due date first across both tool and equipment types", async () => {
      const now = Date.now();
      prisma.toolCribItem.findMany.mockResolvedValue([
        { id: "tool-1", name: "Torque Wrench", calibrationRecords: [{ nextDueAt: new Date(now + 20 * 86400000) }] },
      ]);
      prisma.equipment.findMany.mockResolvedValue([
        { id: "eq-1", name: "Total Station", calibrationRecords: [{ nextDueAt: new Date(now + 5 * 86400000) }] },
      ]);

      const result = await service.dueList(COMPANY_A, 30);

      expect(result.map((r) => r.id)).toEqual(["eq-1", "tool-1"]);
    });
  });
});
