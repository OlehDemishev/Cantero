import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CheckInToolInput, CheckOutToolInput, CreateToolCribItemInput, RegisterToolCribUnitsInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ToolCribService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.toolCribItem.findMany({
      where: { companyId },
      include: { checkouts: { where: { returnedAt: null }, include: { worker: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" },
    });
  }

  async create(companyId: string, actor: AuditActor, input: CreateToolCribItemInput) {
    const item = await this.prisma.toolCribItem.create({
      data: {
        companyId,
        name: input.name,
        barcode: input.barcode,
        replacementCost: input.replacementCost,
        parLevel: input.parLevel,
        quantityOnHand: input.quantityOnHand ?? 0,
        serialTracked: input.serialTracked,
      },
    });
    this.audit.record(companyId, actor, "tool_crib_item.created", "ToolCribItem", item.id, `Added tool crib item "${input.name}"`);
    return item;
  }

  /** Registers one or more physical units (by serial number) under a serialTracked item, each
   * starting "available", and bumps quantityOnHand by the count added — quantityOnHand for a
   * serialTracked item always mirrors the count of units currently available. */
  async registerUnits(companyId: string, actor: AuditActor, itemId: string, input: RegisterToolCribUnitsInput) {
    const item = await this.findItemOrThrow(companyId, itemId);
    if (!item.serialTracked) {
      throw new BadRequestException(`"${item.name}" is not serial-tracked — enable serialTracked before registering units`);
    }

    await this.prisma.$transaction([
      this.prisma.toolCribUnit.createMany({
        data: input.serialNumbers.map((serialNumber) => ({ companyId, toolCribItemId: itemId, serialNumber })),
      }),
      this.prisma.toolCribItem.update({ where: { id: itemId }, data: { quantityOnHand: { increment: input.serialNumbers.length } } }),
    ]);
    this.audit.record(
      companyId,
      actor,
      "tool_crib_unit.registered",
      "ToolCribItem",
      itemId,
      `Registered ${input.serialNumbers.length} unit(s) of "${item.name}"`,
    );
    return this.listUnits(companyId, itemId);
  }

  listUnits(companyId: string, itemId: string) {
    return this.prisma.toolCribUnit.findMany({ where: { companyId, toolCribItemId: itemId }, orderBy: { serialNumber: "asc" } });
  }

  /** The reorder list — items whose on-hand count has dropped below their par level. */
  lowParLevelItems(companyId: string) {
    return this.prisma.toolCribItem.findMany({
      where: { companyId, parLevel: { not: null } },
    }).then((items) => items.filter((i) => i.parLevel !== null && i.quantityOnHand < i.parLevel));
  }

  listCheckoutsForWorker(companyId: string, workerId: string) {
    return this.prisma.toolCheckout.findMany({
      where: { companyId, workerId },
      include: { item: { select: { id: true, name: true } } },
      orderBy: { checkedOutAt: "desc" },
    });
  }

  async checkOut(companyId: string, actor: AuditActor, itemId: string, input: CheckOutToolInput) {
    const item = await this.findItemOrThrow(companyId, itemId);
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    if (item.serialTracked) {
      if (!input.unitId) throw new BadRequestException(`"${item.name}" is serial-tracked — a unitId is required to check it out`);
      const unit = await this.prisma.toolCribUnit.findFirst({ where: { id: input.unitId, toolCribItemId: itemId, companyId } });
      if (!unit) throw new NotFoundException("Unit not found");
      if (unit.status !== "available") throw new BadRequestException(`Unit "${unit.serialNumber}" is not available (${unit.status})`);

      const [checkout] = await this.prisma.$transaction([
        this.prisma.toolCheckout.create({
          data: { companyId, itemId, toolCribUnitId: unit.id, workerId: input.workerId, projectId: input.projectId, quantity: 1, notes: input.notes },
        }),
        this.prisma.toolCribUnit.update({ where: { id: unit.id }, data: { status: "checked_out" } }),
        this.prisma.toolCribItem.update({ where: { id: itemId }, data: { quantityOnHand: { decrement: 1 } } }),
      ]);
      this.audit.record(
        companyId,
        actor,
        "tool_checkout.created",
        "ToolCheckout",
        checkout.id,
        `Checked out "${item.name}" unit ${unit.serialNumber} to ${worker.name}`,
      );
      return checkout;
    }

    const quantity = input.quantity ?? 1;
    if (quantity > item.quantityOnHand) throw new BadRequestException(`Only ${item.quantityOnHand} on hand`);

    const [checkout] = await this.prisma.$transaction([
      this.prisma.toolCheckout.create({
        data: { companyId, itemId, workerId: input.workerId, projectId: input.projectId, quantity, notes: input.notes },
      }),
      this.prisma.toolCribItem.update({ where: { id: itemId }, data: { quantityOnHand: { decrement: quantity } } }),
    ]);
    this.audit.record(companyId, actor, "tool_checkout.created", "ToolCheckout", checkout.id, `Checked out ${quantity} × "${item.name}" to ${worker.name}`);
    return checkout;
  }

  /** A "good" or "damaged" return puts the quantity back on the shelf (damaged tools still count
   * as on-hand — the crib may still repair/reuse them); "lost" never returns to inventory. For a
   * serial-tracked checkout, the specific unit's status mirrors this instead of a bulk decrement:
   * good → available again, damaged → flagged but still on-hand, lost → removed from the pool
   * (retired units are set by hand elsewhere, not through a return). */
  async checkIn(companyId: string, actor: AuditActor, checkoutId: string, input: CheckInToolInput) {
    const checkout = await this.prisma.toolCheckout.findFirst({ where: { id: checkoutId, companyId }, include: { item: true, worker: true } });
    if (!checkout) throw new NotFoundException("Checkout not found");
    if (checkout.returnedAt) throw new BadRequestException("This checkout has already been returned");

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.toolCheckout.update({
        where: { id: checkoutId },
        data: { returnedAt: new Date(), returnCondition: input.returnCondition, chargeAmount: input.chargeAmount, notes: input.notes },
      });
      if (checkout.toolCribUnitId) {
        await tx.toolCribUnit.update({
          where: { id: checkout.toolCribUnitId },
          data: { status: input.returnCondition === "lost" ? "lost" : input.returnCondition === "damaged" ? "damaged" : "available" },
        });
        if (input.returnCondition !== "lost") {
          await tx.toolCribItem.update({ where: { id: checkout.itemId }, data: { quantityOnHand: { increment: 1 } } });
        }
      } else if (input.returnCondition !== "lost") {
        await tx.toolCribItem.update({ where: { id: checkout.itemId }, data: { quantityOnHand: { increment: checkout.quantity } } });
      }
      return result;
    });
    this.audit.record(
      companyId,
      actor,
      "tool_checkout.returned",
      "ToolCheckout",
      checkoutId,
      `${checkout.worker.name} returned "${checkout.item.name}" (${input.returnCondition})`,
    );
    return updated;
  }

  /** Sum of chargeAmount across a worker's damaged/lost returns — the tool-liability figure a
   * manager reviews before offboarding a worker or docking a paycheck. */
  async workerLiability(companyId: string, workerId: string) {
    const checkouts = await this.prisma.toolCheckout.findMany({
      where: { companyId, workerId, chargeAmount: { not: null } },
      include: { item: { select: { name: true } } },
    });
    const totalCharged = checkouts.reduce((sum, c) => sum + Number(c.chargeAmount ?? 0), 0);
    return { totalCharged: Math.round(totalCharged * 100) / 100, checkouts };
  }

  private async findItemOrThrow(companyId: string, id: string) {
    const item = await this.prisma.toolCribItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Tool crib item not found");
    return item;
  }
}
