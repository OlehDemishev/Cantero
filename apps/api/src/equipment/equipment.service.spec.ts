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
    equipmentMaintenanceRecord: { create: jest.Mock; findMany: jest.Mock };
    equipmentFuelLog: { create: jest.Mock; findMany: jest.Mock };
    equipmentRental: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    assetDisposal: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      equipment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      project: { findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      equipmentAssignment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      equipmentGpsPing: { create: jest.fn(), findMany: jest.fn() },
      equipmentMaintenanceRecord: { create: jest.fn(), findMany: jest.fn() },
      equipmentFuelLog: { create: jest.fn(), findMany: jest.fn() },
      equipmentRental: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      assetDisposal: { findUnique: jest.fn(), create: jest.fn() },
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

    it("advances nextMaintenanceDueHours from the current meter reading and clears the hours-notified flag", async () => {
      prisma.equipment.findFirst.mockResolvedValue({
        id: "eq-1",
        companyId: COMPANY_A,
        name: "Compressor",
        status: "maintenance",
        maintenanceIntervalHours: 250,
        currentMeterHours: 370,
      });

      await service.completeMaintenance(COMPANY_A, { name: "Owner" }, "eq-1");

      expect(prisma.equipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextMaintenanceDueHours: 620, maintenanceOverdueHoursNotifiedAt: null }) }),
      );
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

    it("sets an hour-based interval relative to the current meter reading", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor", status: "available", currentMeterHours: 120 });

      await service.updateMaintenanceSchedule(COMPANY_A, { name: "Owner" }, "eq-1", { intervalHours: 250 });

      expect(prisma.equipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { maintenanceIntervalHours: 250, nextMaintenanceDueHours: 370 } }),
      );
    });

    it("leaves the day-based schedule untouched when only intervalHours is passed", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor", status: "available", currentMeterHours: 0 });

      await service.updateMaintenanceSchedule(COMPANY_A, { name: "Owner" }, "eq-1", { intervalHours: 250 });

      const updateArg = prisma.equipment.update.mock.calls[0][0];
      expect(updateArg.data.maintenanceIntervalDays).toBeUndefined();
      expect(updateArg.data.nextMaintenanceDueAt).toBeUndefined();
    });
  });

  describe("updateMeterReading()", () => {
    it("rejects a reading lower than the current one", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor", currentMeterHours: 500 });

      await expect(service.updateMeterReading(COMPANY_A, { name: "Owner" }, "eq-1", { currentMeterHours: 400 })).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });

    it("accepts a higher reading", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor", currentMeterHours: 500 });

      await service.updateMeterReading(COMPANY_A, { name: "Owner" }, "eq-1", { currentMeterHours: 550 });

      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { currentMeterHours: 550 } });
    });

    it("accepts the first reading when none is set yet", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor", currentMeterHours: null });

      await service.updateMeterReading(COMPANY_A, { name: "Owner" }, "eq-1", { currentMeterHours: 10 });

      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { currentMeterHours: 10 } });
    });
  });

  describe("addMaintenanceRecord()", () => {
    it("persists the supplier and meter reading alongside the record", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Compressor" });
      prisma.equipmentMaintenanceRecord.create.mockResolvedValue({ id: "rec-1" });

      await service.addMaintenanceRecord(COMPANY_A, { name: "Owner" }, "eq-1", {
        description: "Oil change",
        supplierId: "supplier-1",
        meterHours: 370,
      });

      expect(prisma.equipmentMaintenanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ supplierId: "supplier-1", meterHours: 370 }) }),
      );
    });
  });

  describe("addFuelLog()", () => {
    it("advances currentMeterHours when the logged reading is higher than the current one", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader", currentMeterHours: 300 });
      prisma.equipmentFuelLog.create.mockResolvedValue({ id: "fuel-1" });

      await service.addFuelLog(COMPANY_A, { name: "Owner" }, "eq-1", { quantity: 20, meterHours: 350 });

      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { currentMeterHours: 350 } });
    });

    it("does not advance currentMeterHours when the logged reading is lower (a backfilled entry), but still saves the log", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader", currentMeterHours: 300 });
      prisma.equipmentFuelLog.create.mockResolvedValue({ id: "fuel-1" });

      await service.addFuelLog(COMPANY_A, { name: "Owner" }, "eq-1", { quantity: 20, meterHours: 250 });

      expect(prisma.equipment.update).not.toHaveBeenCalled();
      expect(prisma.equipmentFuelLog.create).toHaveBeenCalled();
    });

    it("sets currentMeterHours on first reading when none was set yet", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader", currentMeterHours: null });
      prisma.equipmentFuelLog.create.mockResolvedValue({ id: "fuel-1" });

      await service.addFuelLog(COMPANY_A, { name: "Owner" }, "eq-1", { quantity: 20, meterHours: 50 });

      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { currentMeterHours: 50 } });
    });

    it("leaves currentMeterHours untouched when no meter reading is given", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader", currentMeterHours: 300 });
      prisma.equipmentFuelLog.create.mockResolvedValue({ id: "fuel-1" });

      await service.addFuelLog(COMPANY_A, { name: "Owner" }, "eq-1", { quantity: 20 });

      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });
  });

  describe("costPerHour()", () => {
    it("computes cost-per-hour from fuel + maintenance cost against the span of logged meter readings", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader" });
      prisma.equipmentFuelLog.findMany.mockResolvedValue([
        { cost: "100.00", meterHours: "100.0" },
        { cost: "150.00", meterHours: "200.0" },
      ]);
      prisma.equipmentMaintenanceRecord.findMany.mockResolvedValue([{ cost: "50.00", meterHours: "150.0" }]);

      const result = await service.costPerHour(COMPANY_A, "eq-1");

      // total cost = 100+150+50 = 300; hours elapsed = max(100,200,150) - min(...) = 100
      expect(result.totalCost).toBe(300);
      expect(result.costPerHour).toBe(3);
    });

    it("returns a null cost-per-hour when fewer than two meter readings exist", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader" });
      prisma.equipmentFuelLog.findMany.mockResolvedValue([{ cost: "100.00", meterHours: null }]);
      prisma.equipmentMaintenanceRecord.findMany.mockResolvedValue([]);

      const result = await service.costPerHour(COMPANY_A, "eq-1");

      expect(result.costPerHour).toBeNull();
      expect(result.totalCost).toBe(100);
    });
  });

  describe("tco()", () => {
    it("combines fuel, maintenance, and depreciation into a total cost of ownership", async () => {
      prisma.equipment.findFirst.mockResolvedValue({
        id: "eq-1",
        companyId: COMPANY_A,
        name: "Loader",
        purchaseCost: "20000",
        purchaseDate: new Date("2024-01-01T00:00:00Z"),
        depreciationMethod: "straight_line",
        usefulLifeMonths: 60,
        salvageValue: "2000",
      });
      prisma.equipmentFuelLog.findMany.mockResolvedValue([{ cost: "100.00", meterHours: "100.0" }]);
      prisma.equipmentMaintenanceRecord.findMany.mockResolvedValue([{ cost: "50.00", meterHours: "200.0" }]);

      const result = await service.tco(COMPANY_A, "eq-1");

      expect(result.totalCost).toBeGreaterThan(150);
      expect(result.depreciationSharePercent).not.toBeNull();
    });

    it("treats a missing depreciation schedule as zero accumulated depreciation", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Loader", purchaseCost: null, purchaseDate: null, depreciationMethod: null, usefulLifeMonths: null, salvageValue: null });
      prisma.equipmentFuelLog.findMany.mockResolvedValue([{ cost: "100.00", meterHours: "100.0" }]);
      prisma.equipmentMaintenanceRecord.findMany.mockResolvedValue([{ cost: "50.00", meterHours: "200.0" }]);

      const result = await service.tco(COMPANY_A, "eq-1");

      expect(result.totalCost).toBe(150);
      expect(result.depreciationSharePercent).toBe(0);
    });
  });

  describe("retire()", () => {
    it("rejects retiring equipment that's currently checked out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });

      await expect(service.retire(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });

    it("rejects retiring equipment that's currently rented out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "rented_out" });

      await expect(service.retire(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });
  });

  describe("dispose()", () => {
    it("rejects disposing of equipment that's currently checked out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "in_use" });

      await expect(service.dispose(COMPANY_A, { name: "Owner" }, "eq-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.assetDisposal.create).not.toHaveBeenCalled();
    });

    it("rejects disposing of the same equipment twice", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "retired" });
      prisma.assetDisposal.findUnique.mockResolvedValue({ id: "disposal-1", equipmentId: "eq-1" });

      await expect(service.dispose(COMPANY_A, { name: "Owner" }, "eq-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.assetDisposal.create).not.toHaveBeenCalled();
    });

    it("records the disposal and retires the equipment", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Drill", status: "available" });
      prisma.assetDisposal.findUnique.mockResolvedValue(null);
      prisma.assetDisposal.create.mockResolvedValue({ id: "disposal-1", equipmentId: "eq-1", saleAmount: 500 });
      prisma.equipment.update.mockResolvedValue({});

      const result = await service.dispose(COMPANY_A, { name: "Owner" }, "eq-1", { saleAmount: 500, notes: "Sold at auction" });

      expect(result).toEqual({ id: "disposal-1", equipmentId: "eq-1", saleAmount: 500 });
      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { status: "retired" } });
    });
  });

  describe("depreciation()", () => {
    it("returns null when no depreciation schedule is set", () => {
      const result = service.depreciation({
        purchaseCost: 10000,
        purchaseDate: new Date("2025-01-01"),
        depreciationMethod: null,
        usefulLifeMonths: null,
        salvageValue: null,
      });
      expect(result).toBeNull();
    });

    it("computes book value once a full schedule is set", () => {
      const result = service.depreciation({
        purchaseCost: 12000,
        purchaseDate: new Date("2024-01-01"),
        depreciationMethod: "straight_line",
        usefulLifeMonths: 24,
        salvageValue: 0,
      });
      expect(result).not.toBeNull();
      expect(result!.bookValue).toBeLessThan(12000);
    });
  });

  describe("startRental()", () => {
    it("rejects renting out equipment that isn't available", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Excavator", status: "in_use" });

      await expect(
        service.startRental(COMPANY_A, { name: "Owner" }, "eq-1", { renterName: "Acme Rentals", dailyRate: 100 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentRental.create).not.toHaveBeenCalled();
    });

    it("creates a rental and marks the equipment rented_out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Excavator", status: "available" });

      await service.startRental(COMPANY_A, { name: "Owner" }, "eq-1", { renterName: "Acme Rentals", dailyRate: 100 });

      expect(prisma.equipmentRental.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ companyId: COMPANY_A, equipmentId: "eq-1", renterName: "Acme Rentals", dailyRate: 100 }),
      });
      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { status: "rented_out" } });
    });
  });

  describe("endRental()", () => {
    it("rejects ending a rental on equipment that isn't rented out", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Excavator", status: "available" });

      await expect(service.endRental(COMPANY_A, { name: "Owner" }, "eq-1")).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentRental.update).not.toHaveBeenCalled();
    });

    it("closes the open rental and marks the equipment available again", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Excavator", status: "rented_out" });
      prisma.equipmentRental.findFirst.mockResolvedValue({ id: "rental-1", renterName: "Acme Rentals", actualReturnDate: null });

      await service.endRental(COMPANY_A, { name: "Owner" }, "eq-1");

      expect(prisma.equipmentRental.update).toHaveBeenCalledWith({
        where: { id: "rental-1" },
        data: { actualReturnDate: expect.any(Date) },
      });
      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { status: "available" } });
    });
  });

  describe("listRentals()", () => {
    it("computes revenue per rental, open-ended ones valued as of now", async () => {
      prisma.equipment.findFirst.mockResolvedValue({ id: "eq-1", companyId: COMPANY_A, name: "Excavator" });
      prisma.equipmentRental.findMany.mockResolvedValue([
        {
          id: "rental-1",
          dailyRate: 100,
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          actualReturnDate: null,
        },
      ]);

      const result = await service.listRentals(COMPANY_A, "eq-1");

      expect(result[0].daysElapsed).toBeGreaterThanOrEqual(5);
      expect(result[0].revenue).toBe(result[0].daysElapsed * 100);
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
