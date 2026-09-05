import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { InitiateStockTransferInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { StockService } from "./stock.service";

/**
 * Tracks a warehouse-to-warehouse transfer while goods are physically in transit — the
 * counterpart to StockService.transferStock()'s instant, same-moment transfer. initiate() debits
 * the source immediately (goods have left the shelf) and captures the source's own cost via the
 * same costing engine an "issue" would use; receive() credits the destination at that captured
 * cost (as a "receipt" would); cancel() reverses the debit before the goods ever arrive. Between
 * initiate and receive, the quantity counts at neither warehouse — it's genuinely in transit.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  list(companyId: string, warehouseId?: string) {
    return this.prisma.stockTransfer.findMany({
      where: {
        companyId,
        ...(warehouseId ? { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] } : {}),
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        materialCatalogItem: { select: { id: true, name: true, unit: true } },
      },
      orderBy: { initiatedAt: "desc" },
    });
  }

  async initiate(companyId: string, initiatedByName: string, input: InitiateStockTransferInput) {
    const [fromWarehouse, toWarehouse, material] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: input.fromWarehouseId, companyId } }),
      this.prisma.warehouse.findFirst({ where: { id: input.toWarehouseId, companyId } }),
      this.prisma.materialCatalogItem.findFirst({ where: { id: input.materialCatalogItemId, companyId } }),
    ]);
    if (!fromWarehouse) throw new NotFoundException("Source warehouse not found");
    if (!toWarehouse) throw new NotFoundException("Destination warehouse not found");
    if (!material) throw new NotFoundException("Material not found");

    const transfer = await runSerializable(this.prisma, async (tx) => {
      const costing = await this.stockService.computeSingleWarehouseCosting(
        tx,
        companyId,
        input.fromWarehouseId,
        input.materialCatalogItemId,
        "issue",
        input.quantity,
        undefined,
      );

      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          quantity: input.quantity,
          unitCost: costing.movementUnitCost ?? undefined,
          initiatedByName,
        },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          materialCatalogItem: { select: { id: true, name: true, unit: true } },
        },
      });
      await tx.stockLevel.upsert({
        where: { warehouseId_materialCatalogItemId: { warehouseId: input.fromWarehouseId, materialCatalogItemId: input.materialCatalogItemId } },
        create: { warehouseId: input.fromWarehouseId, materialCatalogItemId: input.materialCatalogItemId, quantityOnHand: -input.quantity },
        update: { quantityOnHand: { decrement: input.quantity } },
      });
      return transfer;
    });

    return transfer;
  }

  async receive(companyId: string, receivedByName: string, id: string) {
    // The status check (and the transfer read it's based on) is inside the transaction too, not
    // just the costing/writes — otherwise two concurrent receive() calls on the same transfer
    // could both read "in_transit" before either commits, and both credit the destination.
    const updated = await runSerializable(this.prisma, async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({ where: { id, companyId } });
      if (!transfer) throw new NotFoundException("Stock transfer not found");
      if (transfer.status !== "in_transit") throw new BadRequestException(`Transfer is already ${transfer.status}`);

      const costing = await this.stockService.computeSingleWarehouseCosting(
        tx,
        companyId,
        transfer.toWarehouseId,
        transfer.materialCatalogItemId,
        "receipt",
        Number(transfer.quantity),
        transfer.unitCost != null ? Number(transfer.unitCost) : undefined,
      );

      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "received", receivedByName, receivedAt: new Date() },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          materialCatalogItem: { select: { id: true, name: true, unit: true } },
        },
      });
      await tx.stockLevel.upsert({
        where: { warehouseId_materialCatalogItemId: { warehouseId: transfer.toWarehouseId, materialCatalogItemId: transfer.materialCatalogItemId } },
        create: {
          warehouseId: transfer.toWarehouseId,
          materialCatalogItemId: transfer.materialCatalogItemId,
          quantityOnHand: transfer.quantity,
          averageCost: costing.averageCostUpdate ?? undefined,
        },
        update: {
          quantityOnHand: { increment: transfer.quantity },
          ...(costing.averageCostUpdate !== null ? { averageCost: costing.averageCostUpdate } : {}),
        },
      });
      return updated;
    });

    return updated;
  }

  /**
   * Only a still-in-transit transfer can be cancelled — once received, the destination has
   * already consumed the cost basis and reversing it would mean unwinding real stock elsewhere.
   * Credits the source back at the same captured unitCost, opening a fresh cost layer under fifo
   * rather than restoring the exact original layer(s) it was drawn from — a pragmatic
   * approximation that keeps the total value right without reconstructing consumption order.
   */
  async cancel(companyId: string, id: string) {
    // Same reasoning as receive(): the transfer read and status check happen inside the
    // transaction so two concurrent cancel() calls can't both credit the source warehouse back.
    return runSerializable(this.prisma, async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({ where: { id, companyId } });
      if (!transfer) throw new NotFoundException("Stock transfer not found");
      if (transfer.status !== "in_transit") throw new BadRequestException(`Transfer is already ${transfer.status}`);

      const costing = await this.stockService.computeSingleWarehouseCosting(
        tx,
        companyId,
        transfer.fromWarehouseId,
        transfer.materialCatalogItemId,
        "receipt",
        Number(transfer.quantity),
        transfer.unitCost != null ? Number(transfer.unitCost) : undefined,
      );

      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "cancelled", cancelledAt: new Date() },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          materialCatalogItem: { select: { id: true, name: true, unit: true } },
        },
      });
      await tx.stockLevel.upsert({
        where: { warehouseId_materialCatalogItemId: { warehouseId: transfer.fromWarehouseId, materialCatalogItemId: transfer.materialCatalogItemId } },
        create: {
          warehouseId: transfer.fromWarehouseId,
          materialCatalogItemId: transfer.materialCatalogItemId,
          quantityOnHand: transfer.quantity,
          averageCost: costing.averageCostUpdate ?? undefined,
        },
        update: {
          quantityOnHand: { increment: transfer.quantity },
          ...(costing.averageCostUpdate !== null ? { averageCost: costing.averageCostUpdate } : {}),
        },
      });
      return updated;
    });
  }
}
