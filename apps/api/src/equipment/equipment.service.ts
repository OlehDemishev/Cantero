import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddFuelLogInput,
  AddMaintenanceRecordInput,
  CheckInEquipmentInput,
  CheckOutEquipmentInput,
  CreateEquipmentInput,
  DisposeEquipmentInput,
  SetDepreciationScheduleInput,
  StartEquipmentRentalInput,
  UpdateEquipmentInput,
  UpdateMaintenanceScheduleInput,
  UpdateMeterReadingInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { checkGeofence } from "../team/geofence";
import { calculateCostPerHour } from "./equipment-cost";
import { calculateRentalRevenue } from "./equipment-rental";
import { calculateDepreciation } from "./equipment-depreciation";
import { calculateTotalCostOfOwnership } from "./equipment-tco";

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.equipment.findMany({
      where: { companyId },
      include: {
        assignments: {
          where: { checkedInAt: null },
          include: { project: { select: { name: true } }, worker: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    const disposal = await this.prisma.assetDisposal.findUnique({ where: { equipmentId: id } });
    return { ...equipment, disposal, depreciation: this.depreciation(equipment) };
  }

  async create(companyId: string, actor: AuditActor, input: CreateEquipmentInput) {
    const equipment = await this.prisma.equipment.create({
      data: {
        companyId,
        name: input.name,
        category: input.category,
        serialNumber: input.serialNumber,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
        purchaseCost: input.purchaseCost,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "equipment.created", "Equipment", equipment.id, `Added equipment "${input.name}"`);
    return equipment;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateEquipmentInput) {
    const existing = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.equipment.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        serialNumber: input.serialNumber,
        purchaseCost: input.purchaseCost,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "equipment.updated", "Equipment", id, `Updated equipment "${existing.name}"`);
    return updated;
  }

  async checkOut(companyId: string, actor: AuditActor, id: string, input: CheckOutEquipmentInput) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "available") {
      throw new BadRequestException(`Equipment is ${equipment.status.replace("_", " ")}, not available to check out`);
    }

    let project: { geofenceLat: number | null; geofenceLng: number | null; geofenceRadiusMeters: number | null } | null = null;
    if (input.projectId) {
      project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
    if (input.workerId) {
      const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
      if (!worker) throw new NotFoundException("Worker not found");
    }

    const geofence =
      input.lat !== undefined && input.lng !== undefined && project?.geofenceLat != null && project.geofenceLng != null && project.geofenceRadiusMeters != null
        ? checkGeofence(input.lat, input.lng, project.geofenceLat, project.geofenceLng, project.geofenceRadiusMeters)
        : null;

    await this.prisma.$transaction([
      this.prisma.equipmentAssignment.create({
        data: {
          equipmentId: id,
          projectId: input.projectId,
          workerId: input.workerId,
          notes: input.notes,
          checkOutLat: input.lat,
          checkOutLng: input.lng,
          checkOutDistanceFromSiteM: geofence?.distanceMeters,
          checkOutWithinGeofence: geofence?.withinGeofence,
        },
      }),
      this.prisma.equipment.update({ where: { id }, data: { status: "in_use" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.checked_out", "Equipment", id, `Checked out "${equipment.name}"`, {
      projectId: input.projectId,
      workerId: input.workerId,
    });
    return this.findOrThrow(companyId, id);
  }

  async checkIn(companyId: string, actor: AuditActor, id: string, input: CheckInEquipmentInput) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "in_use") {
      throw new BadRequestException("Equipment is not currently checked out");
    }

    const openAssignment = await this.prisma.equipmentAssignment.findFirst({
      where: { equipmentId: id, checkedInAt: null },
      orderBy: { checkedOutAt: "desc" },
      include: { project: { select: { geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true } } },
    });
    if (!openAssignment) throw new BadRequestException("No open assignment found for this equipment");

    const project = openAssignment.project;
    const geofence =
      input.lat !== undefined && input.lng !== undefined && project?.geofenceLat != null && project.geofenceLng != null && project.geofenceRadiusMeters != null
        ? checkGeofence(input.lat, input.lng, project.geofenceLat, project.geofenceLng, project.geofenceRadiusMeters)
        : null;

    await this.prisma.$transaction([
      this.prisma.equipmentAssignment.update({
        where: { id: openAssignment.id },
        data: {
          checkedInAt: new Date(),
          checkInLat: input.lat,
          checkInLng: input.lng,
          checkInDistanceFromSiteM: geofence?.distanceMeters,
          checkInWithinGeofence: geofence?.withinGeofence,
        },
      }),
      this.prisma.equipment.update({ where: { id }, data: { status: "available" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.checked_in", "Equipment", id, `Checked in "${equipment.name}"`);
    return this.findOrThrow(companyId, id);
  }

  async startMaintenance(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "available") {
      throw new BadRequestException("Check the equipment in before sending it to maintenance");
    }
    await this.prisma.equipment.update({ where: { id }, data: { status: "maintenance" } });
    this.audit.record(companyId, actor, "equipment.maintenance_started", "Equipment", id, `Sent "${equipment.name}" to maintenance`);
    return this.findOrThrow(companyId, id);
  }

  async completeMaintenance(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "maintenance") {
      throw new BadRequestException("Equipment is not in maintenance");
    }
    await this.prisma.equipment.update({
      where: { id },
      data: {
        status: "available",
        // Advances relative to completion time, not the old due date, so a late service doesn't
        // permanently shift the schedule earlier than intended — same approach as
        // RecurringInvoicesService.generateInvoice's nextRunDate advance.
        nextMaintenanceDueAt: equipment.maintenanceIntervalDays
          ? new Date(Date.now() + equipment.maintenanceIntervalDays * 24 * 60 * 60 * 1000)
          : undefined,
        maintenanceOverdueNotifiedAt: null,
        // Same idea, keyed off the current meter reading instead of the calendar.
        nextMaintenanceDueHours: equipment.maintenanceIntervalHours
          ? Number(equipment.currentMeterHours ?? 0) + Number(equipment.maintenanceIntervalHours)
          : undefined,
        maintenanceOverdueHoursNotifiedAt: null,
      },
    });
    this.audit.record(companyId, actor, "equipment.maintenance_completed", "Equipment", id, `Completed maintenance on "${equipment.name}"`);
    return this.findOrThrow(companyId, id);
  }

  /** null clears that half of the schedule; undefined leaves it untouched. Setting an interval
   * (re)starts that countdown from now (days) or from the current meter reading (hours) —
   * the two halves are independent and either, both, or neither can be active. */
  async updateMaintenanceSchedule(companyId: string, actor: AuditActor, id: string, input: UpdateMaintenanceScheduleInput) {
    const equipment = await this.findOrThrow(companyId, id);
    const data: Record<string, unknown> = {};
    if (input.intervalDays !== undefined) {
      data.maintenanceIntervalDays = input.intervalDays;
      data.nextMaintenanceDueAt = input.intervalDays ? new Date(Date.now() + input.intervalDays * 24 * 60 * 60 * 1000) : null;
    }
    if (input.intervalHours !== undefined) {
      data.maintenanceIntervalHours = input.intervalHours;
      data.nextMaintenanceDueHours = input.intervalHours ? Number(equipment.currentMeterHours ?? 0) + input.intervalHours : null;
    }
    await this.prisma.equipment.update({ where: { id }, data });

    const parts: string[] = [];
    if (input.intervalDays !== undefined) {
      parts.push(input.intervalDays ? `every ${input.intervalDays} day(s)` : "calendar schedule disabled");
    }
    if (input.intervalHours !== undefined) {
      parts.push(input.intervalHours ? `every ${input.intervalHours} meter-hour(s)` : "meter-hour schedule disabled");
    }
    this.audit.record(
      companyId,
      actor,
      "equipment.maintenance_schedule_updated",
      "Equipment",
      id,
      `Updated preventive maintenance schedule for "${equipment.name}": ${parts.join(", ")}`,
    );
    return this.findOrThrow(companyId, id);
  }

  async updateMeterReading(companyId: string, actor: AuditActor, id: string, input: UpdateMeterReadingInput) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.currentMeterHours !== null && input.currentMeterHours < Number(equipment.currentMeterHours)) {
      throw new BadRequestException("New meter reading can't be lower than the current one");
    }
    await this.prisma.equipment.update({ where: { id }, data: { currentMeterHours: input.currentMeterHours } });
    this.audit.record(
      companyId,
      actor,
      "equipment.meter_reading_updated",
      "Equipment",
      id,
      `Logged meter reading for "${equipment.name}": ${input.currentMeterHours}h`,
    );
    return this.findOrThrow(companyId, id);
  }

  async retire(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status === "in_use") {
      throw new BadRequestException("Check the equipment in before retiring it");
    }
    if (equipment.status === "rented_out") {
      throw new BadRequestException("End the active rental before retiring this equipment");
    }
    await this.prisma.equipment.update({ where: { id }, data: { status: "retired" } });
    this.audit.record(companyId, actor, "equipment.retired", "Equipment", id, `Retired "${equipment.name}"`);
    return this.findOrThrow(companyId, id);
  }

  async setDepreciationSchedule(companyId: string, actor: AuditActor, id: string, input: SetDepreciationScheduleInput) {
    const equipment = await this.findOrThrow(companyId, id);
    const updated = await this.prisma.equipment.update({
      where: { id },
      data: {
        depreciationMethod: input.depreciationMethod,
        usefulLifeMonths: input.usefulLifeMonths,
        salvageValue: input.salvageValue,
      },
    });
    this.audit.record(companyId, actor, "equipment.depreciation_schedule_set", "Equipment", id, `Set depreciation schedule for "${equipment.name}"`);
    return updated;
  }

  /** Book value computed live from purchaseCost/purchaseDate + the depreciation schedule — see
   * equipment-depreciation.ts. Returns null when purchaseCost, purchaseDate, or the schedule
   * (method + usefulLifeMonths) isn't fully set, rather than fabricating a number from partial data. */
  depreciation(equipment: {
    purchaseCost: unknown;
    purchaseDate: Date | null;
    depreciationMethod: "straight_line" | "declining_balance" | null;
    usefulLifeMonths: number | null;
    salvageValue: unknown;
  }) {
    if (equipment.purchaseCost === null || !equipment.purchaseDate || !equipment.depreciationMethod || !equipment.usefulLifeMonths) return null;
    return calculateDepreciation({
      cost: Number(equipment.purchaseCost),
      purchaseDate: equipment.purchaseDate,
      method: equipment.depreciationMethod,
      usefulLifeMonths: equipment.usefulLifeMonths,
      salvageValue: Number(equipment.salvageValue ?? 0),
      asOf: new Date(),
    });
  }

  /** Recorded once per piece of equipment (AssetDisposal.equipmentId is unique) — the sale (or
   * scrap) amount vs. book value at disposal time is the accounting gain/loss. Also moves the
   * equipment to retired, same as retire(), so a disposed asset stops showing as available/in-use. */
  async dispose(companyId: string, actor: AuditActor, id: string, input: DisposeEquipmentInput) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status === "in_use" || equipment.status === "rented_out") {
      throw new BadRequestException("Check the equipment in or end its rental before disposing of it");
    }
    const existing = await this.prisma.assetDisposal.findUnique({ where: { equipmentId: id } });
    if (existing) throw new BadRequestException("This equipment has already been disposed of");

    const [disposal] = await this.prisma.$transaction([
      this.prisma.assetDisposal.create({ data: { companyId, equipmentId: id, saleAmount: input.saleAmount, notes: input.notes } }),
      this.prisma.equipment.update({ where: { id }, data: { status: "retired" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.disposed", "Equipment", id, `Disposed of "${equipment.name}"`);
    return disposal;
  }

  /** The fixed-asset register: every piece of equipment with a purchase cost, its current book
   * value, and whether/how it was disposed of — the standard report a bookkeeper or accountant
   * pulls at year-end. */
  async fixedAssetRegister(companyId: string) {
    const equipment = await this.prisma.equipment.findMany({
      where: { companyId, purchaseCost: { not: null } },
      include: { disposal: true },
      orderBy: { purchaseDate: "asc" },
    });
    return equipment.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      purchaseCost: e.purchaseCost,
      purchaseDate: e.purchaseDate,
      depreciationMethod: e.depreciationMethod,
      usefulLifeMonths: e.usefulLifeMonths,
      salvageValue: e.salvageValue,
      depreciation: this.depreciation(e),
      disposal: e.disposal,
    }));
  }

  /** Renting OUR equipment out to an external party — the mirror image of checkOut(), which is
   * OUR use of OUR equipment. Same "must be available" gate as checkOut(), so a rental can't be
   * started on top of an internal assignment or an existing rental. */
  async startRental(companyId: string, actor: AuditActor, id: string, input: StartEquipmentRentalInput) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "available") {
      throw new BadRequestException(`Equipment is ${equipment.status.replace("_", " ")}, not available to rent out`);
    }

    await this.prisma.$transaction([
      this.prisma.equipmentRental.create({
        data: {
          companyId,
          equipmentId: id,
          renterName: input.renterName,
          renterContact: input.renterContact,
          dailyRate: input.dailyRate,
          expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : undefined,
          notes: input.notes,
        },
      }),
      this.prisma.equipment.update({ where: { id }, data: { status: "rented_out" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.rental_started", "Equipment", id, `Rented out "${equipment.name}" to ${input.renterName}`);
    return this.findOrThrow(companyId, id);
  }

  async endRental(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "rented_out") {
      throw new BadRequestException("Equipment is not currently rented out");
    }

    const openRental = await this.prisma.equipmentRental.findFirst({
      where: { equipmentId: id, actualReturnDate: null },
      orderBy: { startDate: "desc" },
    });
    if (!openRental) throw new BadRequestException("No open rental found for this equipment");

    await this.prisma.$transaction([
      this.prisma.equipmentRental.update({ where: { id: openRental.id }, data: { actualReturnDate: new Date() } }),
      this.prisma.equipment.update({ where: { id }, data: { status: "available" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.rental_ended", "Equipment", id, `Returned "${equipment.name}" from rental to ${openRental.renterName}`);
    return this.findOrThrow(companyId, id);
  }

  async listRentals(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    const rentals = await this.prisma.equipmentRental.findMany({
      where: { equipmentId: id, companyId },
      orderBy: { startDate: "desc" },
    });
    const now = new Date();
    return rentals.map((r) => ({
      ...r,
      ...calculateRentalRevenue({ dailyRate: Number(r.dailyRate), startDate: r.startDate, asOf: r.actualReturnDate ?? now }),
    }));
  }

  async addMaintenanceRecord(companyId: string, actor: AuditActor, id: string, input: AddMaintenanceRecordInput) {
    const equipment = await this.findOrThrow(companyId, id);
    const record = await this.prisma.equipmentMaintenanceRecord.create({
      data: {
        equipmentId: id,
        description: input.description,
        cost: input.cost,
        performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
        supplierId: input.supplierId,
        meterHours: input.meterHours,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "equipment.maintenance_logged",
      "Equipment",
      id,
      `Logged maintenance on "${equipment.name}": ${input.description}`,
    );
    return record;
  }

  listMaintenanceRecords(companyId: string, id: string) {
    return this.prisma.equipmentMaintenanceRecord.findMany({
      where: { equipmentId: id, equipment: { companyId } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { performedAt: "desc" },
    });
  }

  /** Self-reported fuel purchase — see EquipmentFuelLog's schema comment. If a meter reading is
   * given and it's higher than the current one (or none is set yet), it also advances
   * Equipment.currentMeterHours — same one-way-forward rule as updateMeterReading(), but a lower
   * or missing reading here is just a log entry, not an error (unlike updateMeterReading, which
   * rejects it outright — a fuel log is routine enough that backfilling an out-of-order entry
   * shouldn't block the whole save). */
  async addFuelLog(companyId: string, actor: AuditActor, id: string, input: AddFuelLogInput) {
    const equipment = await this.findOrThrow(companyId, id);
    const log = await this.prisma.equipmentFuelLog.create({
      data: {
        equipmentId: id,
        quantity: input.quantity,
        cost: input.cost,
        filledAt: input.filledAt ? new Date(input.filledAt) : undefined,
        meterHours: input.meterHours,
        supplierId: input.supplierId,
        notes: input.notes,
      },
    });
    if (input.meterHours !== undefined && (equipment.currentMeterHours === null || input.meterHours > Number(equipment.currentMeterHours))) {
      await this.prisma.equipment.update({ where: { id }, data: { currentMeterHours: input.meterHours } });
    }
    this.audit.record(companyId, actor, "equipment.fuel_logged", "Equipment", id, `Logged fuel for "${equipment.name}": ${input.quantity}`);
    return log;
  }

  listFuelLogs(companyId: string, id: string) {
    return this.prisma.equipmentFuelLog.findMany({
      where: { equipmentId: id, equipment: { companyId } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { filledAt: "desc" },
    });
  }

  /** Cost-per-hour rolled up from fuel + maintenance cost against the span between the earliest
   * and latest logged meter reading across both — computed at read time, not stored. */
  async costPerHour(companyId: string, id: string) {
    await this.findOrThrow(companyId, id);
    const [fuelLogs, maintenanceRecords] = await Promise.all([
      this.prisma.equipmentFuelLog.findMany({ where: { equipmentId: id }, select: { cost: true, meterHours: true } }),
      this.prisma.equipmentMaintenanceRecord.findMany({ where: { equipmentId: id }, select: { cost: true, meterHours: true } }),
    ]);

    const readings = [...fuelLogs, ...maintenanceRecords]
      .map((r) => r.meterHours)
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .map(Number);
    const hoursElapsed = readings.length >= 2 ? Math.max(...readings) - Math.min(...readings) : 0;

    return calculateCostPerHour({
      totalFuelCost: fuelLogs.reduce((sum, l) => sum + Number(l.cost ?? 0), 0),
      totalMaintenanceCost: maintenanceRecords.reduce((sum, r) => sum + Number(r.cost ?? 0), 0),
      hoursElapsed,
    });
  }

  /** Total cost of ownership to date: fuel + maintenance (same rollup as costPerHour()) plus the
   * book-value loss from the depreciation schedule, if one is set — the figure that actually
   * drives a buy/rent/replace decision, unlike either piece alone. */
  async tco(companyId: string, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    const [fuelLogs, maintenanceRecords] = await Promise.all([
      this.prisma.equipmentFuelLog.findMany({ where: { equipmentId: id }, select: { cost: true, meterHours: true } }),
      this.prisma.equipmentMaintenanceRecord.findMany({ where: { equipmentId: id }, select: { cost: true, meterHours: true } }),
    ]);

    const readings = [...fuelLogs, ...maintenanceRecords]
      .map((r) => r.meterHours)
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .map(Number);
    const hoursElapsed = readings.length >= 2 ? Math.max(...readings) - Math.min(...readings) : 0;

    const dep = this.depreciation(equipment);

    return calculateTotalCostOfOwnership({
      fuelCost: fuelLogs.reduce((sum, l) => sum + Number(l.cost ?? 0), 0),
      maintenanceCost: maintenanceRecords.reduce((sum, r) => sum + Number(r.cost ?? 0), 0),
      accumulatedDepreciation: dep?.accumulatedDepreciation ?? 0,
      hoursElapsed,
    });
  }

  listAssignments(companyId: string, id: string) {
    return this.prisma.equipmentAssignment.findMany({
      where: { equipmentId: id, equipment: { companyId } },
      include: { project: { select: { name: true } }, worker: { select: { name: true } } },
      orderBy: { checkedOutAt: "desc" },
    });
  }

  /** Recorded by whichever device is tracking this equipment — no telematics hardware or
   * external provider involved, so there's no verification the ping is genuine; it's a
   * self-reported location, same trust level as a check-in note. */
  async recordGpsPing(companyId: string, id: string, lat: number, lng: number) {
    await this.findOrThrow(companyId, id);
    return this.prisma.equipmentGpsPing.create({ data: { equipmentId: id, lat, lng } });
  }

  /** One day's route, oldest first — the field UI plots these as a simple polyline. Defaults to
   * today (UTC) when no explicit date is given. */
  async listGpsPings(companyId: string, id: string, date?: string) {
    await this.findOrThrow(companyId, id);
    const day = date ? new Date(date) : new Date();
    const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.equipmentGpsPing.findMany({
      where: { equipmentId: id, recordedAt: { gte: from, lt: to } },
      orderBy: { recordedAt: "asc" },
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const equipment = await this.prisma.equipment.findFirst({
      where: { id, companyId },
      include: {
        assignments: {
          where: { checkedInAt: null },
          include: { project: { select: { name: true } }, worker: { select: { name: true } } },
        },
      },
    });
    if (!equipment) throw new NotFoundException("Equipment not found");
    return equipment;
  }
}
