import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { EquipmentService } from "./equipment.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("EquipmentService", () => {
  let service: EquipmentService;
  let prisma: {
    equipment: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    project: { findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    equipmentAssignment: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      equipment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      equipmentAssignment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [
        EquipmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn(), list: jest.fn() } },
      ],
    }).compile();

    service = module.get(EquipmentService);
  });

  describe("checkOut()", () => {
    it("rejects checking out equipment that isn't available", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });

      await expect(
        service.checkOut(COMPANY_A, { name: "Owner" }, "eq-1", { workerId: "worker-1" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentAssignment.create).not.toHaveBeenCalled();
    });

    it("rejects a workerId that belongs to another company", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.checkOut(COMPANY_A, { name: "Owner" }, "eq-1", { workerId: "foreign-worker" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.equipmentAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe("checkIn()", () => {
    it("rejects checking in equipment that isn't checked out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });

      await expect(service.checkIn(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentAssignment.update).not.toHaveBeenCalled();
    });
  });

  describe("startMaintenance()", () => {
    it("rejects sending checked-out equipment straight to maintenance", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });

      await expect(service.startMaintenance(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });
  });

  describe("completeMaintenance()", () => {
    it("rejects completing maintenance on equipment that isn't in maintenance", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });

      await expect(service.completeMaintenance(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });
  });

  describe("retire()", () => {
    it("rejects retiring equipment that's currently checked out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });

      await expect(service.retire(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });
  });
});
