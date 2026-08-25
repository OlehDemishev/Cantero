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

    it("advances nextMaintenanceDueAt from now and clears the overdue-notified flag when an interval is set", async () => {
      prisma.equipment.findFirst.mockResolvedValue({
        id: "eq-1",
        companyId: COMPANY_A,
        name: "Drill",
        status: "maintenance",
        maintenanceIntervalDays: 30,
      });

      await service.completeMaintenance(COMPANY_A, { name: "Owner" }, "eq-1");

      const updateArg = prisma.equipment.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe("available");
      expect(updateArg.data.maintenanceOverdueNotifiedAt).toBeNull();
      expect(updateArg.data.nextMaintenanceDueAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("leaves nextMaintenanceDueAt untouched when no interval is configured", async () => {
      prisma.equipment.findFirst.mockResolvedValue({
        id: "eq-1",
        companyId: COMPANY_A,
        name: "Drill",
        status: "maintenance",
        maintenanceIntervalDays: null,
      });

      await service.completeMaintenance(COMPANY_A, { name: "Owner" }, "eq-1");

      const updateArg = prisma.equipment.update.mock.calls[0][0];
      expect(updateArg.data.nextMaintenanceDueAt).toBeUndefined();
    });
  });

  describe("updateMaintenanceSchedule()", () => {
    it("sets the interval and computes a due date roughly `intervalDays` from now", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });

      await service.updateMaintenanceSchedule(COMPANY_A, { name: "Owner" }, "eq-1", { intervalDays: 90 });

      const updateArg = prisma.equipment.update.mock.calls[0][0];
      expect(updateArg.data.maintenanceIntervalDays).toBe(90);
      const expected = Date.now() + 90 * 24 * 60 * 60 * 1000;
      expect(Math.abs(updateArg.data.nextMaintenanceDueAt.getTime() - expected)).toBeLessThan(5000);
    });

    it("clears both the interval and the due date when passed null", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });

      await service.updateMaintenanceSchedule(COMPANY_A, { name: "Owner" }, "eq-1", { intervalDays: null });

      expect(prisma.equipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { maintenanceIntervalDays: null, nextMaintenanceDueAt: null } }),
      );
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
