import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateStockCountInput, UpdateStockCountLineInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StockService } from "./stock.service";

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  list(companyId: string, warehouseId?: string) {
    return this.prisma.stockCount.findMany({
      where: { companyId, ...(warehouseId ? { warehouseId } : {}) },
      include: { warehouse: true, lines: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    return this.findOrThrow(companyId, id);
  }

  /**
   * Starts a count: one line per company material, system quantity snapshotted
   * from that warehouse's current StockLevel (0 if it has never had one) so
   * staff can find stock the books didn't know was there, not just count what's expected.
   */
  async create(companyId: string, input: CreateStockCountInput) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    const materials = await this.prisma.materialCatalogItem.findMany({ where: { companyId } });
    const levels = await this.prisma.stockLevel.findMany({ where: { warehouseId: input.warehouseId } });
    const levelByMaterial = new Map(levels.map((l) => [l.materialCatalogItemId, l.quantityOnHand]));

    const count = await this.prisma.stockCount.create({
      data: {
        companyId,
        warehouseId: input.warehouseId,
        lines: {
          create: materials.map((m) => {
            const system = levelByMaterial.get(m.id) ?? 0;
            return { materialCatalogItemId: m.id, systemQuantity: system, countedQuantity: system };
          }),
        },
      },
    });
    return this.findOrThrow(companyId, count.id);
  }

  async updateLine(companyId: string, countId: string, lineId: string, input: UpdateStockCountLineInput) {
    const count = await this.findOrThrow(companyId, countId);
    if (count.status !== "draft") throw new BadRequestException("Only a draft count can be edited");
    const line = count.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException("Count line not found");

    await this.prisma.stockCountLine.update({ where: { id: lineId }, data: { countedQuantity: input.countedQuantity } });
    return this.findOrThrow(companyId, countId);
  }

  /**
   * Applies each line's variance as an ordinary receipt (found more than the
   * books said) or write_off (found less) StockMovement — reusing recordMovement
   * so the low-stock queue and StockLevel updates stay exactly consistent with
   * every other way stock changes, rather than a parallel adjustment path.
   */
  async finalize(companyId: string, countId: string) {
    const count = await this.findOrThrow(companyId, countId);
    if (count.status !== "draft") throw new BadRequestException("Count already finalized");

    for (const line of count.lines) {
      const delta = Number(line.countedQuantity) - Number(line.systemQuantity);
      if (delta === 0) continue;
      await this.stockService.recordMovement(companyId, {
        warehouseId: count.warehouseId,
        materialCatalogItemId: line.materialCatalogItemId,
        type: delta > 0 ? "receipt" : "write_off",
        quantity: Math.abs(delta),
      });
    }

    await this.prisma.stockCount.update({
      where: { id: countId },
      data: { status: "finalized", finalizedAt: new Date() },
    });
    return this.findOrThrow(companyId, countId);
  }

  private async findOrThrow(companyId: string, id: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id, companyId },
      include: { warehouse: true, lines: { include: { materialCatalogItem: true }, orderBy: { id: "asc" } } },
    });
    if (!count) throw new NotFoundException("Stock count not found");
    return count;
  }
}
