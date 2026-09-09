import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TimeEntriesService } from "./time-entries.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("TimeEntriesService", () => {
  let service: TimeEntriesService;
  let prisma: {
    timeEntry: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findFirst: jest.Mock };
    worker: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    task: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      timeEntry: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
      worker: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      task: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [TimeEntriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TimeEntriesService);
  });

  const baseInput = { workerId: "worker-1", projectId: "project-1", hours: 8, date: "2026-01-05" };

  describe("create()", () => {
    it("throws when the worker doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, baseInput)).rejects.toThrow(NotFoundException);
    });

    it("throws when the project doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, baseInput)).rejects.toThrow(NotFoundException);
    });

    it("rejects a task that doesn't belong to the given project", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null });
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(service.create(COMPANY_A, { ...baseInput, taskId: "task-1" })).rejects.toThrow(BadRequestException);
    });

    it("leaves geofence fields undefined when the project has no geofence configured", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null });
      prisma.timeEntry.create.mockResolvedValue({});

      await service.create(COMPANY_A, { ...baseInput, clockInLat: 40, clockInLng: -73 });

      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.distanceFromSiteMeters).toBeUndefined();
      expect(data.withinGeofence).toBeUndefined();
    });

    it("leaves geofence fields undefined when clock-in coordinates aren't provided", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: 40.0, geofenceLng: -73.0, geofenceRadiusMeters: 100 });
      prisma.timeEntry.create.mockResolvedValue({});

      await service.create(COMPANY_A, baseInput);

      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.distanceFromSiteMeters).toBeUndefined();
      expect(data.withinGeofence).toBeUndefined();
    });

    it("flags a clock-in inside the project's geofence radius", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: 40.0, geofenceLng: -73.0, geofenceRadiusMeters: 500 });
      prisma.timeEntry.create.mockResolvedValue({});

      await service.create(COMPANY_A, { ...baseInput, clockInLat: 40.0, clockInLng: -73.0 });

      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.withinGeofence).toBe(true);
      expect(data.distanceFromSiteMeters).toBe(0);
    });

    it("flags a clock-in outside the project's geofence radius", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 50 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: 40.0, geofenceLng: -73.0, geofenceRadiusMeters: 10 });
      prisma.timeEntry.create.mockResolvedValue({});

      await service.create(COMPANY_A, { ...baseInput, clockInLat: 41.0, clockInLng: -73.0 });

      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.withinGeofence).toBe(false);
      expect(data.distanceFromSiteMeters).toBeGreaterThan(10);
    });

    it("snapshots the worker's current hourly cost onto the entry", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", hourlyCost: 62.5 });
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null });
      prisma.timeEntry.create.mockResolvedValue({});

      await service.create(COMPANY_A, baseInput);

      expect(prisma.timeEntry.create.mock.calls[0][0].data.hourlyCostSnapshot).toBe(62.5);
    });
  });

  describe("update()", () => {
    it("throws when the entry doesn't belong to the company", async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      await expect(service.update(COMPANY_A, "entry-1", { hours: 4 })).rejects.toThrow(NotFoundException);
    });

    it("rejects a task that doesn't belong to the entry's project", async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: "entry-1", projectId: "project-1" });
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(service.update(COMPANY_A, "entry-1", { taskId: "task-2" })).rejects.toThrow(BadRequestException);
    });

    it("updates only the provided fields", async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: "entry-1", projectId: "project-1" });
      prisma.timeEntry.update.mockResolvedValue({});

      await service.update(COMPANY_A, "entry-1", { hours: 6 });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith({ where: { id: "entry-1" }, data: { hours: 6 }, include: { worker: true, task: true } });
    });
  });

  describe("delete()", () => {
    it("throws when the entry doesn't belong to the company", async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      await expect(service.delete(COMPANY_A, "entry-1")).rejects.toThrow(NotFoundException);
    });

    it("deletes an entry that belongs to the company", async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: "entry-1" });
      const result = await service.delete(COMPANY_A, "entry-1");
      expect(prisma.timeEntry.delete).toHaveBeenCalledWith({ where: { id: "entry-1" } });
      expect(result).toEqual({ ok: true });
    });
  });
});
