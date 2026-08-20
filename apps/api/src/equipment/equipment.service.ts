import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddMaintenanceRecordInput,
  CheckOutEquipmentInput,
  CreateEquipmentInput,
  UpdateEquipmentInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

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

  get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
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

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
    if (input.workerId) {
      const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
      if (!worker) throw new NotFoundException("Worker not found");
    }

    await this.prisma.$transaction([
      this.prisma.equipmentAssignment.create({
        data: { equipmentId: id, projectId: input.projectId, workerId: input.workerId, notes: input.notes },
      }),
      this.prisma.equipment.update({ where: { id }, data: { status: "in_use" } }),
    ]);

    this.audit.record(companyId, actor, "equipment.checked_out", "Equipment", id, `Checked out "${equipment.name}"`, {
      projectId: input.projectId,
      workerId: input.workerId,
    });
    return this.findOrThrow(companyId, id);
  }

  async checkIn(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status !== "in_use") {
      throw new BadRequestException("Equipment is not currently checked out");
    }

    const openAssignment = await this.prisma.equipmentAssignment.findFirst({
      where: { equipmentId: id, checkedInAt: null },
      orderBy: { checkedOutAt: "desc" },
    });
    if (!openAssignment) throw new BadRequestException("No open assignment found for this equipment");

    await this.prisma.$transaction([
      this.prisma.equipmentAssignment.update({ where: { id: openAssignment.id }, data: { checkedInAt: new Date() } }),
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
    await this.prisma.equipment.update({ where: { id }, data: { status: "available" } });
    this.audit.record(companyId, actor, "equipment.maintenance_completed", "Equipment", id, `Completed maintenance on "${equipment.name}"`);
    return this.findOrThrow(companyId, id);
  }

  async retire(companyId: string, actor: AuditActor, id: string) {
    const equipment = await this.findOrThrow(companyId, id);
    if (equipment.status === "in_use") {
      throw new BadRequestException("Check the equipment in before retiring it");
    }
    await this.prisma.equipment.update({ where: { id }, data: { status: "retired" } });
    this.audit.record(companyId, actor, "equipment.retired", "Equipment", id, `Retired "${equipment.name}"`);
    return this.findOrThrow(companyId, id);
  }

  async addMaintenanceRecord(companyId: string, actor: AuditActor, id: string, input: AddMaintenanceRecordInput) {
    const equipment = await this.findOrThrow(companyId, id);
    const record = await this.prisma.equipmentMaintenanceRecord.create({
      data: {
        equipmentId: id,
        description: input.description,
        cost: input.cost,
        performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
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
    return this.prisma.equipmentMaintenanceRecord
      .findMany({ where: { equipmentId: id, equipment: { companyId } }, orderBy: { performedAt: "desc" } });
  }

  listAssignments(companyId: string, id: string) {
    return this.prisma.equipmentAssignment.findMany({
      where: { equipmentId: id, equipment: { companyId } },
      include: { project: { select: { name: true } }, worker: { select: { name: true } } },
      orderBy: { checkedOutAt: "desc" },
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
