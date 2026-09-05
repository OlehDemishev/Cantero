import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { InitiateStockTransferInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
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

    const costing = await this.stockService.computeSingleWarehouseCosting(
      companyId,
      input.fromWarehouseId,
      input.materialCatalogItemId,
      "issue",
      input.quantity,
      undefined,
    );

    const [transfer] = await this.prisma.$transaction([
      this.prisma.stockTransfer.create({
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
      }),
      this.prisma.stockLevel.upsert({
        where: { warehouseId_materialCatalogItemId: { warehouseId: input.fromWarehouseId, materialCatalogItemId: input.materialCatalogItemId } },
        create: { warehouseId: input.fromWarehouseId, materialCatalogItemId: input.materialCatalogItemId, quantityOnHand: -input.quantity },
        update: { quantityOnHand: { decrement: input.quantity } },
      }),
      ...costing.layerOps,
    ]);

    return transfer;
  }

  async receive(companyId: string, receivedByName: string, id: string) {
    const transfer = await this.findOrThrow(companyId, id);
    if (transfer.status !== "in_transit") throw new BadRequestException(`Transfer is already ${transfer.status}`);

    const costing = await this.stockService.computeSingleWarehouseCosting(
      companyId,
      transfer.toWarehouseId,
      transfer.materialCatalogItemId,
      "receipt",
      Number(transfer.quantity),
      transfer.unitCost != null ? Number(transfer.unitCost) : undefined,
    );

    const [updated] = await this.prisma.$transaction([
      this.prisma.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "received", receivedByName, receivedAt: new Date() },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          materialCatalogItem: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.stockLevel.upsert({
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
      }),
      ...costing.layerOps,
    ]);

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
    const transfer = await this.findOrThrow(companyId, id);
    if (transfer.status !== "in_transit") throw new BadRequestException(`Transfer is already ${transfer.status}`);

    const costing = await this.stockService.computeSingleWarehouseCosting(
      companyId,
      transfer.fromWarehouseId,
      transfer.materialCatalogItemId,
      "receipt",
      Number(transfer.quantity),
      transfer.unitCost != null ? Number(transfer.unitCost) : undefined,
    );

    const [updated] = await this.prisma.$transaction([
      this.prisma.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "cancelled", cancelledAt: new Date() },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          materialCatalogItem: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.stockLevel.upsert({
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
      }),
      ...costing.layerOps,
    ]);

    return updated;
  }

  private async findOrThrow(companyId: string, id: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({ where: { id, companyId } });
    if (!transfer) throw new NotFoundException("Stock transfer not found");
    return transfer;
  }
}
