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
    equipmentGpsPing: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      equipment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      equipmentAssignment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      equipmentGpsPing: { create: jest.fn(), findMany: jest.fn() },
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

    it("records the geofence check against the project's site when both a location and a geofenced project are given", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: 50, geofenceLng: 8, geofenceRadiusMeters: 100 });
      prisma.equipmentAssignment.create.mockResolvedValue({ id: "assignment-1" });

      await service.checkOut(COMPANY_A, { name: "Owner" }, "eq-1", { projectId: "project-1", lat: 50, lng: 8 });

      expect(prisma.equipmentAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkOutLat: 50, checkOutLng: 8, checkOutWithinGeofence: true, checkOutDistanceFromSiteM: 0 }),
        }),
      );
    });

    it("leaves the geofence fields null when the project has no geofence configured", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null });
      prisma.equipmentAssignment.create.mockResolvedValue({ id: "assignment-1" });

      await service.checkOut(COMPANY_A, { name: "Owner" }, "eq-1", { projectId: "project-1", lat: 50, lng: 8 });

      expect(prisma.equipmentAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkOutWithinGeofence: undefined, checkOutDistanceFromSiteM: undefined }),
        }),
      );
    });
  });

  describe("checkIn()", () => {
    it("rejects checking in equipment that isn't checked out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });

      await expect(service.checkIn(COMPANY_A, { name: "Owner" }, "eq-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentAssignment.update).not.toHaveBeenCalled();
    });

    it("flags check-in as outside the geofence when far from the project's site", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });
      prisma.equipmentAssignment.findFirst.mockResolvedValue({
        id: "assignment-1",
        project: { geofenceLat: 50, geofenceLng: 8, geofenceRadiusMeters: 100 },
      });
      prisma.equipmentAssignment.update.mockResolvedValue({ id: "assignment-1" });

      // ~11km away from the geofence center — well outside a 100m radius.
      await service.checkIn(COMPANY_A, { name: "Owner" }, "eq-1", { lat: 50.1, lng: 8 });

      expect(prisma.equipmentAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ checkInWithinGeofence: false }) }),
      );
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

  describe("recordGpsPing()/listGpsPings()", () => {
    it("rejects recording a ping for equipment that doesn't belong to this company", async () => {
      prisma.equipment.findFirst.mockResolvedValue(null);

      await expect(service.recordGpsPing(COMPANY_A, "eq-1", 52.5, 13.4)).rejects.toThrow(NotFoundException);
      expect(prisma.equipmentGpsPing.create).not.toHaveBeenCalled();
    });

    it("records a ping scoped to the equipment", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill" });
      prisma.equipmentGpsPing.create.mockResolvedValue({ id: "ping-1", equipmentId: "eq-1", lat: 52.5, lng: 13.4 });

      await service.recordGpsPing(COMPANY_A, "eq-1", 52.5, 13.4);

      expect(prisma.equipmentGpsPing.create).toHaveBeenCalledWith({ data: { equipmentId: "eq-1", lat: 52.5, lng: 13.4 } });
    });

    it("scopes listGpsPings to a single UTC day", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill" });
      prisma.equipmentGpsPing.findMany.mockResolvedValue([]);

      await service.listGpsPings(COMPANY_A, "eq-1", "2026-06-15");

      const call = prisma.equipmentGpsPing.findMany.mock.calls[0][0];
      expect(call.where.equipmentId).toBe("eq-1");
      expect(call.where.recordedAt.gte.toISOString()).toBe("2026-06-15T00:00:00.000Z");
      expect(call.where.recordedAt.lt.toISOString()).toBe("2026-06-16T00:00:00.000Z");
    });
  });
});
