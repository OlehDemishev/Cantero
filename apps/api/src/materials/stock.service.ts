import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { Prisma } from "@prisma/client";
import type { RecordStockMovementInput, SetBinLocationInput, TransferStockInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { STOCK_ALERTS_QUEUE } from "../common/queue/queue.module";
import type { LowStockCheckJob } from "./low-stock.processor";
import { calculateFifoConsumption, calculateWeightedAverageCost } from "./inventory-costing";
import { runSerializable } from "../common/prisma/serializable-transaction";

const DECREASING_TYPES = new Set(["issue", "write_off"]);

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(STOCK_ALERTS_QUEUE) private readonly stockAlertsQueue: Queue<LowStockCheckJob>,
  ) {}

  listLevels(companyId: string, warehouseId?: string) {
    return this.prisma.stockLevel.findMany({
      where: { warehouse: { companyId }, ...(warehouseId ? { warehouseId } : {}) },
      include: { materialCatalogItem: true, warehouse: true },
    });
  }

  listMovements(companyId: string, warehouseId?: string, cursor?: string) {
    return this.prisma.stockMovement.findMany({
      where: { companyId, ...(warehouseId ? { warehouseId } : {}) },
      include: { materialCatalogItem: true, project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async recordMovement(companyId: string, input: RecordStockMovementInput) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, companyId },
    });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    const material = await this.prisma.materialCatalogItem.findFirst({
      where: { id: input.materialCatalogItemId, companyId },
    });
    if (!material) throw new NotFoundException("Material not found");

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    const delta = DECREASING_TYPES.has(input.type) ? -input.quantity : input.quantity;

    const movement = await runSerializable(this.prisma, async (tx) => {
      const costing = await this.computeSingleWarehouseCosting(
        tx,
        companyId,
        input.warehouseId,
        input.materialCatalogItemId,
        input.type,
        input.quantity,
        input.unitCost,
      );

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: input.warehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          type: input.type,
          quantity: input.quantity,
          projectId: input.projectId,
          unitCost: costing.movementUnitCost ?? undefined,
        },
      });
      await tx.stockLevel.upsert({
        where: {
          warehouseId_materialCatalogItemId: {
            warehouseId: input.warehouseId,
            materialCatalogItemId: input.materialCatalogItemId,
          },
        },
        create: {
          warehouseId: input.warehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          quantityOnHand: delta,
          averageCost: costing.averageCostUpdate ?? undefined,
        },
        update: {
          quantityOnHand: { increment: delta },
          ...(costing.averageCostUpdate !== null ? { averageCost: costing.averageCostUpdate } : {}),
        },
      });
      return movement;
    });

    if (delta < 0) {
      await this.queueLowStockCheck(companyId, input.materialCatalogItemId);
    }

    return movement;
  }

  /**
   * Costs a receipt/issue/write_off at one warehouse under the company's chosen method — see
   * inventory-costing.ts. A receipt with no unitCost given produces no cost data at all (the
   * pre-costing behavior, unchanged); an issue/write_off against a material with no cost history
   * yet (never received with a cost) likewise produces none rather than guessing.
   *
   * Takes a transaction client (`tx`) and does its cost-layer reads AND writes through it, rather
   * than taking `companyId` and using `this.prisma` directly the way this used to work — reading
   * "remaining quantity" outside a transaction and then writing an absolute new value back inside
   * one is a classic TOCTOU race: two concurrent issues can both read the same layer snapshot,
   * both compute their own "remaining after my consumption", and the second write silently
   * clobbers the first, over-issuing stock the layer never actually had. Every caller now runs
   * this inside `runSerializable`, so a conflicting concurrent transaction aborts and retries
   * instead of corrupting the layer.
   */
  async computeSingleWarehouseCosting(
    tx: Prisma.TransactionClient,
    companyId: string,
    warehouseId: string,
    materialCatalogItemId: string,
    type: "receipt" | "issue" | "write_off",
    quantity: number,
    unitCost: number | undefined,
  ): Promise<{ movementUnitCost: number | null; averageCostUpdate: number | null }> {
    if (type === "receipt") {
      if (unitCost === undefined) return { movementUnitCost: null, averageCostUpdate: null };

      const stockLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId } },
      });
      const averageCostUpdate = calculateWeightedAverageCost(
        Number(stockLevel?.quantityOnHand ?? 0),
        stockLevel?.averageCost != null ? Number(stockLevel.averageCost) : null,
        quantity,
        unitCost,
      );

      const method = await this.getCostingMethodTx(tx, companyId);
      if (method === "fifo") {
        await tx.inventoryCostLayer.create({ data: { companyId, warehouseId, materialCatalogItemId, remainingQuantity: quantity, unitCost } });
      }
      return { movementUnitCost: unitCost, averageCostUpdate };
    }

    // issue / write_off
    const method = await this.getCostingMethodTx(tx, companyId);
    if (method === "weighted_average") {
      const stockLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId } },
      });
      const averageCost = stockLevel?.averageCost != null ? Number(stockLevel.averageCost) : null;
      return { movementUnitCost: averageCost, averageCostUpdate: null };
    }

    const layers = await tx.inventoryCostLayer.findMany({
      where: { warehouseId, materialCatalogItemId, remainingQuantity: { gt: 0 } },
      orderBy: { receivedAt: "asc" },
    });
    if (layers.length === 0) return { movementUnitCost: null, averageCostUpdate: null };

    const result = calculateFifoConsumption(
      layers.map((l) => ({ id: l.id, remainingQuantity: Number(l.remainingQuantity), unitCost: Number(l.unitCost) })),
      quantity,
    );
    for (const l of result.updatedLayers) {
      if (l.remainingQuantity <= 0) {
        await tx.inventoryCostLayer.delete({ where: { id: l.id } });
      } else {
        await tx.inventoryCostLayer.update({ where: { id: l.id }, data: { remainingQuantity: l.remainingQuantity } });
      }
    }
    const movementUnitCost = result.consumedQuantity > 0 ? result.totalCost / result.consumedQuantity : null;
    return { movementUnitCost, averageCostUpdate: null };
  }

  async getCostingMethod(companyId: string): Promise<"fifo" | "weighted_average"> {
    return this.getCostingMethodTx(this.prisma, companyId);
  }

  private async getCostingMethodTx(tx: Prisma.TransactionClient | PrismaService, companyId: string): Promise<"fifo" | "weighted_average"> {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { inventoryCostingMethod: true } });
    return company.inventoryCostingMethod;
  }

  /**
   * Moves stock between two of the company's own warehouses as a single atomic
   * operation: one `transfer` StockMovement row records both sides (warehouseId
   * debited, toWarehouseId credited), and both StockLevel rows update together —
   * unlike the generic movements endpoint, which only ever touches one warehouse
   * and so can't represent a transfer without silently losing the credited half.
   */
  async transferStock(companyId: string, input: TransferStockInput) {
    const [fromWarehouse, toWarehouse, material] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: input.fromWarehouseId, companyId } }),
      this.prisma.warehouse.findFirst({ where: { id: input.toWarehouseId, companyId } }),
      this.prisma.materialCatalogItem.findFirst({ where: { id: input.materialCatalogItemId, companyId } }),
    ]);
    if (!fromWarehouse) throw new NotFoundException("Source warehouse not found");
    if (!toWarehouse) throw new NotFoundException("Destination warehouse not found");
    if (!material) throw new NotFoundException("Material not found");

    const movement = await runSerializable(this.prisma, async (tx) => {
      const costing = await this.computeTransferCosting(tx, companyId, input.fromWarehouseId, input.toWarehouseId, input.materialCatalogItemId, input.quantity);

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          type: "transfer",
          quantity: input.quantity,
          unitCost: costing.movementUnitCost ?? undefined,
        },
      });
      await tx.stockLevel.upsert({
        where: {
          warehouseId_materialCatalogItemId: {
            warehouseId: input.fromWarehouseId,
            materialCatalogItemId: input.materialCatalogItemId,
          },
        },
        create: { warehouseId: input.fromWarehouseId, materialCatalogItemId: input.materialCatalogItemId, quantityOnHand: -input.quantity },
        update: { quantityOnHand: { decrement: input.quantity } },
      });
      await tx.stockLevel.upsert({
        where: {
          warehouseId_materialCatalogItemId: {
            warehouseId: input.toWarehouseId,
            materialCatalogItemId: input.materialCatalogItemId,
          },
        },
        create: {
          warehouseId: input.toWarehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          quantityOnHand: input.quantity,
          averageCost: costing.destAverageCostUpdate ?? undefined,
        },
        update: {
          quantityOnHand: { increment: input.quantity },
          ...(costing.destAverageCostUpdate !== null ? { averageCost: costing.destAverageCostUpdate } : {}),
        },
      });
      return movement;
    });

    await this.queueLowStockCheck(companyId, input.materialCatalogItemId);

    return movement;
  }

  /**
   * Carries a transfer's cost basis from the source warehouse to the destination — otherwise a
   * transfer would silently reset the destination's cost to nothing. weighted_average: the
   * source's current average cost blends into the destination's average the same way a costed
   * receipt would. fifo: consumes the source's oldest layers (may fall short if its FIFO history
   * doesn't cover the full quantity — same shortfall handling as a single-warehouse issue) and
   * opens ONE new destination layer at the blended cost of what was consumed, rather than trying
   * to carry over each individual source layer's own age.
   */
  /** Same TOCTOU concern as computeSingleWarehouseCosting above — takes `tx` and does every read
   * and write (source layer consumption, destination layer creation) through it. */
  private async computeTransferCosting(
    tx: Prisma.TransactionClient,
    companyId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    materialCatalogItemId: string,
    quantity: number,
  ): Promise<{
    movementUnitCost: number | null;
    destAverageCostUpdate: number | null;
  }> {
    const none = { movementUnitCost: null, destAverageCostUpdate: null };
    const method = await this.getCostingMethodTx(tx, companyId);

    if (method === "weighted_average") {
      const sourceLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_materialCatalogItemId: { warehouseId: fromWarehouseId, materialCatalogItemId } },
      });
      const unitCost = sourceLevel?.averageCost != null ? Number(sourceLevel.averageCost) : null;
      if (unitCost === null) return none;

      const destLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_materialCatalogItemId: { warehouseId: toWarehouseId, materialCatalogItemId } },
      });
      const destAverageCostUpdate = calculateWeightedAverageCost(
        Number(destLevel?.quantityOnHand ?? 0),
        destLevel?.averageCost != null ? Number(destLevel.averageCost) : null,
        quantity,
        unitCost,
      );
      return { movementUnitCost: unitCost, destAverageCostUpdate };
    }

    const layers = await tx.inventoryCostLayer.findMany({
      where: { warehouseId: fromWarehouseId, materialCatalogItemId, remainingQuantity: { gt: 0 } },
      orderBy: { receivedAt: "asc" },
    });
    if (layers.length === 0) return none;

    const result = calculateFifoConsumption(
      layers.map((l) => ({ id: l.id, remainingQuantity: Number(l.remainingQuantity), unitCost: Number(l.unitCost) })),
      quantity,
    );
    if (result.consumedQuantity <= 0) return none;

    const blendedUnitCost = result.totalCost / result.consumedQuantity;
    for (const l of result.updatedLayers) {
      if (l.remainingQuantity <= 0) {
        await tx.inventoryCostLayer.delete({ where: { id: l.id } });
      } else {
        await tx.inventoryCostLayer.update({ where: { id: l.id }, data: { remainingQuantity: l.remainingQuantity } });
      }
    }
    await tx.inventoryCostLayer.create({
      data: { companyId, warehouseId: toWarehouseId, materialCatalogItemId, remainingQuantity: result.consumedQuantity, unitCost: blendedUnitCost },
    });

    const destLevel = await tx.stockLevel.findUnique({
      where: { warehouseId_materialCatalogItemId: { warehouseId: toWarehouseId, materialCatalogItemId } },
    });
    const destAverageCostUpdate = calculateWeightedAverageCost(
      Number(destLevel?.quantityOnHand ?? 0),
      destLevel?.averageCost != null ? Number(destLevel.averageCost) : null,
      result.consumedQuantity,
      blendedUnitCost,
    );

    return { movementUnitCost: blendedUnitCost, destAverageCostUpdate };
  }

  /**
   * Issues stock for every line of an approved estimate's material requirement
   * list against one warehouse — the "Phase 1 list becomes actionable" link
   * called for in the roadmap. Non-blocking on shortfall: it issues what's
   * asked and reports the resulting stock level so the office can reorder
   * rather than silently failing mid-issue.
   */
  async issueFromEstimate(companyId: string, estimateId: string, warehouseId: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId },
      include: { requirements: { include: { materialCatalogItem: true } } },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (estimate.status !== "approved") {
      throw new BadRequestException("Estimate must be approved before issuing stock against it");
    }
    if (estimate.requirements.length === 0) {
      throw new BadRequestException("Estimate has no material requirements to issue");
    }

    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    const report: { materialCatalogItemId: string; name: string; required: number; remainingStock: number }[] = [];

    for (const req of estimate.requirements) {
      const quantity = Number(req.quantity);
      const delta = -quantity;

      await this.prisma.$transaction([
        this.prisma.stockMovement.create({
          data: {
            companyId,
            warehouseId,
            materialCatalogItemId: req.materialCatalogItemId,
            type: "issue",
            quantity,
            projectId: estimate.projectId,
          },
        }),
        this.prisma.stockLevel.upsert({
          where: {
            warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId: req.materialCatalogItemId },
          },
          create: { warehouseId, materialCatalogItemId: req.materialCatalogItemId, quantityOnHand: delta },
          update: { quantityOnHand: { increment: delta } },
        }),
      ]);

      await this.queueLowStockCheck(companyId, req.materialCatalogItemId);

      const level = await this.prisma.stockLevel.findUnique({
        where: { warehouseId_materialCatalogItemId: { warehouseId, materialCatalogItemId: req.materialCatalogItemId } },
      });
      report.push({
        materialCatalogItemId: req.materialCatalogItemId,
        name: req.materialCatalogItem.name,
        required: quantity,
        remainingStock: Number(level?.quantityOnHand ?? 0),
      });
    }

    return { estimateId, warehouseId, lines: report };
  }

  /** Upserts the StockLevel row so a bin location can be set before any movement has ever
   * happened at that warehouse for this item (a brand-new bin gets labeled ahead of its first receipt). */
  async setBinLocation(companyId: string, input: SetBinLocationInput) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    const material = await this.prisma.materialCatalogItem.findFirst({ where: { id: input.materialCatalogItemId, companyId } });
    if (!material) throw new NotFoundException("Material not found");

    return this.prisma.stockLevel.upsert({
      where: { warehouseId_materialCatalogItemId: { warehouseId: input.warehouseId, materialCatalogItemId: input.materialCatalogItemId } },
      create: { warehouseId: input.warehouseId, materialCatalogItemId: input.materialCatalogItemId, binLocation: input.binLocation },
      update: { binLocation: input.binLocation },
    });
  }

  private async queueLowStockCheck(companyId: string, materialCatalogItemId: string) {
    await this.stockAlertsQueue.add(
      "check",
      { companyId, materialCatalogItemId },
      { removeOnComplete: true, removeOnFail: true },
    );
  }

  /**
   * Total inventory value on hand, one row per warehouse+material — under weighted_average this
   * is just quantityOnHand × averageCost; under fifo it's the sum of each remaining cost layer's
   * own quantity × unitCost, which is the more precise figure when multiple receipts landed at
   * different prices. A material with quantityOnHand but no cost history yet (never received
   * through a costed movement) is still listed, with unitValue/totalValue null rather than 0, so
   * "worth nothing" and "cost unknown" aren't confused.
   */
  async inventoryValuation(companyId: string, warehouseId?: string) {
    const method = await this.getCostingMethod(companyId);

    if (method === "fifo") {
      const layers = await this.prisma.inventoryCostLayer.findMany({
        where: { companyId, ...(warehouseId ? { warehouseId } : {}) },
        include: { warehouse: { select: { name: true } }, materialCatalogItem: { select: { name: true, unit: true } } },
      });
      const buckets = new Map<
        string,
        { warehouseId: string; warehouseName: string; materialCatalogItemId: string; materialName: string; unit: string; quantity: number; totalValue: number }
      >();
      for (const layer of layers) {
        const key = `${layer.warehouseId}:${layer.materialCatalogItemId}`;
        if (!buckets.has(key)) {
          buckets.set(key, {
            warehouseId: layer.warehouseId,
            warehouseName: layer.warehouse.name,
            materialCatalogItemId: layer.materialCatalogItemId,
            materialName: layer.materialCatalogItem.name,
            unit: layer.materialCatalogItem.unit,
            quantity: 0,
            totalValue: 0,
          });
        }
        const bucket = buckets.get(key)!;
        bucket.quantity += Number(layer.remainingQuantity);
        bucket.totalValue += Number(layer.remainingQuantity) * Number(layer.unitCost);
      }
      const rows = Array.from(buckets.values()).map((b) => ({
        ...b,
        unitValue: b.quantity > 0 ? b.totalValue / b.quantity : null,
      }));
      return { method, rows, totalValue: rows.reduce((sum, r) => sum + r.totalValue, 0) };
    }

    const levels = await this.prisma.stockLevel.findMany({
      where: { warehouse: { companyId }, ...(warehouseId ? { warehouseId } : {}) },
      include: { warehouse: { select: { name: true } }, materialCatalogItem: { select: { name: true, unit: true } } },
    });
    const rows = levels
      .filter((l) => Number(l.quantityOnHand) !== 0)
      .map((l) => {
        const quantity = Number(l.quantityOnHand);
        const unitValue = l.averageCost != null ? Number(l.averageCost) : null;
        return {
          warehouseId: l.warehouseId,
          warehouseName: l.warehouse.name,
          materialCatalogItemId: l.materialCatalogItemId,
          materialName: l.materialCatalogItem.name,
          unit: l.materialCatalogItem.unit,
          quantity,
          unitValue,
          totalValue: unitValue != null ? quantity * unitValue : 0,
        };
      });
    return { method, rows, totalValue: rows.reduce((sum, r) => sum + r.totalValue, 0) };
  }
}
