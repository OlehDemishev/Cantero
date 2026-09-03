import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FleetService } from "./fleet.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";

describe("FleetService", () => {
  let service: FleetService;
  let prisma: {
    vehicle: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    vehicleInspection: { findMany: jest.Mock; create: jest.Mock };
    worker: { findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      vehicle: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      vehicleInspection: { findMany: jest.fn(), create: jest.fn() },
      worker: { findFirst: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        FleetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(FleetService);
  });

  describe("create()", () => {
    it("rejects assigning a driver who doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, { name: "Owner" }, { name: "Truck 1", assignedDriverId: "worker-1" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates a vehicle with a valid driver", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.vehicle.create.mockResolvedValue({ id: "v1", name: "Truck 1" });

      const result = await service.create(COMPANY_A, { name: "Owner" }, { name: "Truck 1", assignedDriverId: "worker-1" });

      expect(result.id).toBe("v1");
    });
  });

  describe("setDriverCdlExpiry()", () => {
    it("rejects a worker who doesn't belong to the company", async () => {
      prisma.worker.findFirst.mockResolvedValue(null);

      await expect(service.setDriverCdlExpiry(COMPANY_A, { name: "Owner" }, "worker-1", { cdlExpiresAt: null })).rejects.toThrow(NotFoundException);
    });

    it("updates the worker's CDL expiry", async () => {
      prisma.worker.findFirst.mockResolvedValue({ id: "worker-1", name: "Jane" });
      prisma.worker.update.mockResolvedValue({ id: "worker-1", cdlExpiresAt: new Date("2027-01-01") });

      const result = await service.setDriverCdlExpiry(COMPANY_A, { name: "Owner" }, "worker-1", { cdlExpiresAt: "2027-01-01T00:00:00.000Z" });

      expect(result.cdlExpiresAt).toEqual(new Date("2027-01-01"));
    });
  });

  describe("logInspection()", () => {
    it("rejects logging an inspection for a vehicle that doesn't exist", async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.logInspection(COMPANY_A, { name: "Owner" }, "v1", { result: "passed" })).rejects.toThrow(NotFoundException);
    });

    it("logs an inspection", async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: "v1", name: "Truck 1" });
      prisma.vehicleInspection.create.mockResolvedValue({ id: "insp-1", result: "failed" });

      const result = await service.logInspection(COMPANY_A, { name: "Owner" }, "v1", { result: "failed", notes: "Brake light out" });

      expect(result.result).toBe("failed");
    });
  });
});
