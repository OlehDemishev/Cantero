import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddVehicleFuelLogInput,
  CreateVehicleInput,
  LogVehicleInspectionInput,
  SetDriverCdlExpiryInput,
  UpdateVehicleInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateFuelEfficiency } from "./vehicle-fuel-efficiency";

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.vehicle.findMany({
      where: { companyId },
      include: { assignedDriver: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const vehicle = await this.findOrThrow(companyId, id);
    const inspections = await this.prisma.vehicleInspection.findMany({ where: { vehicleId: id }, orderBy: { inspectedAt: "desc" } });
    return { ...vehicle, inspections };
  }

  async create(companyId: string, actor: AuditActor, input: CreateVehicleInput) {
    if (input.assignedDriverId) await this.assertDriver(companyId, input.assignedDriverId);

    const vehicle = await this.prisma.vehicle.create({
      data: {
        companyId,
        name: input.name,
        vin: input.vin,
        licensePlate: input.licensePlate,
        type: input.type,
        assignedDriverId: input.assignedDriverId,
        registrationExpiresAt: input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : undefined,
        insuranceExpiresAt: input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : undefined,
        odometerMiles: input.odometerMiles,
      },
      include: { assignedDriver: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "vehicle.created", "Vehicle", vehicle.id, `Added vehicle "${input.name}"`);
    return vehicle;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateVehicleInput) {
    const existing = await this.findOrThrow(companyId, id);
    if (input.assignedDriverId) await this.assertDriver(companyId, input.assignedDriverId);

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        name: input.name,
        vin: input.vin,
        licensePlate: input.licensePlate,
        type: input.type,
        assignedDriverId: input.assignedDriverId,
        registrationExpiresAt:
          input.registrationExpiresAt === undefined ? undefined : input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
        insuranceExpiresAt: input.insuranceExpiresAt === undefined ? undefined : input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
        odometerMiles: input.odometerMiles,
      },
      include: { assignedDriver: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "vehicle.updated", "Vehicle", id, `Updated vehicle "${existing.name}"`);
    return updated;
  }

  async logInspection(companyId: string, actor: AuditActor, id: string, input: LogVehicleInspectionInput) {
    const vehicle = await this.findOrThrow(companyId, id);
    const inspection = await this.prisma.vehicleInspection.create({
      data: { companyId, vehicleId: id, result: input.result, inspectorName: input.inspectorName, notes: input.notes },
    });
    this.audit.record(companyId, actor, "vehicle.inspection_logged", "Vehicle", id, `Logged a ${input.result} inspection for "${vehicle.name}"`);
    return inspection;
  }

  listFuelLogs(companyId: string, id: string) {
    return this.prisma.vehicleFuelLog.findMany({ where: { vehicleId: id, companyId }, orderBy: { filledAt: "desc" } });
  }

  async addFuelLog(companyId: string, actor: AuditActor, id: string, input: AddVehicleFuelLogInput) {
    const vehicle = await this.findOrThrow(companyId, id);
    const log = await this.prisma.vehicleFuelLog.create({
      data: {
        companyId,
        vehicleId: id,
        quantity: input.quantity,
        cost: input.cost,
        odometerMiles: input.odometerMiles,
        idleHours: input.idleHours,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "vehicle.fuel_logged", "Vehicle", id, `Logged fuel fill-up for "${vehicle.name}"`);
    return log;
  }

  /** Fuel/idle-time efficiency rolled up per vehicle, from the same odometer-span approach as
   * Equipment's cost-per-hour — computed at read time, nothing denormalized. */
  async fuelEfficiencyReport(companyId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { companyId },
      include: { fuelLogs: { select: { quantity: true, odometerMiles: true, idleHours: true } } },
      orderBy: { name: "asc" },
    });

    return vehicles.map((vehicle) => ({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      ...calculateFuelEfficiency(
        vehicle.fuelLogs.map((l) => ({
          quantity: Number(l.quantity),
          odometerMiles: l.odometerMiles !== null ? Number(l.odometerMiles) : null,
          idleHours: l.idleHours !== null ? Number(l.idleHours) : null,
        })),
      ),
    }));
  }

  async setDriverCdlExpiry(companyId: string, actor: AuditActor, workerId: string, input: SetDriverCdlExpiryInput) {
    const worker = await this.assertDriver(companyId, workerId);
    const updated = await this.prisma.worker.update({ where: { id: workerId }, data: { cdlExpiresAt: input.cdlExpiresAt ? new Date(input.cdlExpiresAt) : null } });
    this.audit.record(companyId, actor, "worker.cdl_updated", "Worker", workerId, `Updated CDL expiry for ${worker.name}`);
    return updated;
  }

  private async assertDriver(companyId: string, workerId: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id: workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    return worker;
  }

  private async findOrThrow(companyId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, companyId }, include: { assignedDriver: { select: { id: true, name: true } } } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");
    return vehicle;
  }
}
