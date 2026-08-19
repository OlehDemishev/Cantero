import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { RecordStockMovementInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { STOCK_ALERTS_QUEUE } from "../common/queue/queue.module";
import type { LowStockCheckJob } from "./low-stock.processor";

const DECREASING_TYPES = new Set(["issue", "transfer", "write_off"]);

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

  listMovements(companyId: string, warehouseId?: string) {
    return this.prisma.stockMovement.findMany({
      where: { companyId, ...(warehouseId ? { warehouseId } : {}) },
      include: { materialCatalogItem: true },
      orderBy: { createdAt: "desc" },
      take: 100,
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

    const delta = DECREASING_TYPES.has(input.type) ? -input.quantity : input.quantity;

    const [movement] = await this.prisma.$transaction([
      this.prisma.stockMovement.create({
        data: {
          companyId,
          warehouseId: input.warehouseId,
          materialCatalogItemId: input.materialCatalogItemId,
          type: input.type,
          quantity: input.quantity,
          projectId: input.projectId,
        },
      }),
      this.prisma.stockLevel.upsert({
        where: {
          warehouseId_materialCatalogItemId: {
            warehouseId: input.warehouseId,
            materialCatalogItemId: input.materialCatalogItemId,
          },
        },
        create: { warehouseId: input.warehouseId, materialCatalogItemId: input.materialCatalogItemId, quantityOnHand: delta },
        update: { quantityOnHand: { increment: delta } },
      }),
    ]);

    if (delta < 0) {
      await this.queueLowStockCheck(companyId, input.materialCatalogItemId);
    }

    return movement;
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

  private async queueLowStockCheck(companyId: string, materialCatalogItemId: string) {
    await this.stockAlertsQueue.add(
      "check",
      { companyId, materialCatalogItemId },
      { removeOnComplete: true, removeOnFail: true },
    );
  }
}
