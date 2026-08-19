import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { STOCK_ALERTS_QUEUE } from "../common/queue/queue.module";

export interface LowStockCheckJob {
  companyId: string;
  materialCatalogItemId: string;
}

/**
 * Runs after every stock movement that could push a material below its reorder
 * threshold. Sums quantity on hand across all of the company's warehouses and
 * logs an alert if it's under the configured threshold.
 *
 * This is intentionally minimal — no email/Slack delivery yet — to demonstrate
 * the BullMQ wiring the architecture calls for without building a notification
 * system nobody has asked for.
 */
@Processor(STOCK_ALERTS_QUEUE)
export class LowStockProcessor extends WorkerHost {
  private readonly logger = new Logger(LowStockProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<LowStockCheckJob>): Promise<{ belowThreshold: boolean; quantityOnHand?: number }> {
    const { materialCatalogItemId } = job.data;

    const material = await this.prisma.materialCatalogItem.findUnique({
      where: { id: materialCatalogItemId },
    });
    if (!material || material.reorderThreshold === null) {
      return { belowThreshold: false };
    }

    const levels = await this.prisma.stockLevel.findMany({ where: { materialCatalogItemId } });
    const quantityOnHand = levels.reduce((sum, l) => sum + Number(l.quantityOnHand), 0);

    const belowThreshold = quantityOnHand < Number(material.reorderThreshold);
    if (belowThreshold) {
      this.logger.warn(
        `Low stock: ${material.code} (${material.name}) at ${quantityOnHand}${material.unit}, below reorder threshold of ${material.reorderThreshold}${material.unit}`,
      );
    }
    return { belowThreshold, quantityOnHand };
  }
}
