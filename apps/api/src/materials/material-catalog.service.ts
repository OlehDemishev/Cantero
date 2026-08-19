import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMaterialCatalogItemInput, UpdateMaterialReorderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class MaterialCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.materialCatalogItem.findMany({
      where: { companyId },
      include: { preferredSupplier: true },
      orderBy: { code: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const item = await this.prisma.materialCatalogItem.findFirst({
      where: { id, companyId },
      include: { preferredSupplier: true },
    });
    if (!item) throw new NotFoundException("Material catalog item not found");
    return item;
  }

  create(companyId: string, input: CreateMaterialCatalogItemInput) {
    return this.prisma.materialCatalogItem.create({
      data: { ...input, companyId },
    });
  }

  async updateReorderSettings(companyId: string, id: string, input: UpdateMaterialReorderInput) {
    await this.get(companyId, id);
    if (input.preferredSupplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: input.preferredSupplierId, companyId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
    }
    return this.prisma.materialCatalogItem.update({
      where: { id },
      data: input,
      include: { preferredSupplier: true },
    });
  }

  /** Every price this material has been ordered at, oldest first, plus the current catalog price as the latest reference point. */
  async priceHistory(companyId: string, id: string) {
    const item = await this.get(companyId, id);
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { materialCatalogItemId: id, purchaseOrder: { companyId } },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { purchaseOrder: { createdAt: "asc" } },
    });

    const points: { date: Date; unitPrice: number; supplierName: string; source: "order" | "catalog" }[] = lines.map(
      (line) => ({
        date: line.purchaseOrder.createdAt,
        unitPrice: Number(line.unitPrice),
        supplierName: line.purchaseOrder.supplier.name,
        source: "order",
      }),
    );
    points.push({
      date: new Date(),
      unitPrice: Number(item.defaultUnitPrice),
      supplierName: "",
      source: "catalog" as const,
    });

    return points;
  }

  /** Per-supplier price summary for this material, derived from purchase order history — cheapest first. */
  async supplierPrices(companyId: string, id: string) {
    await this.get(companyId, id);
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { materialCatalogItemId: id, purchaseOrder: { companyId } },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
    });

    const bySupplier = new Map<
      string,
      { supplierId: string; supplierName: string; prices: number[]; latestUnitPrice: number; latestOrderDate: Date }
    >();
    for (const line of lines) {
      const supplierId = line.purchaseOrder.supplierId;
      const price = Number(line.unitPrice);
      const existing = bySupplier.get(supplierId);
      if (existing) {
        existing.prices.push(price);
      } else {
        bySupplier.set(supplierId, {
          supplierId,
          supplierName: line.purchaseOrder.supplier.name,
          prices: [price],
          latestUnitPrice: price,
          latestOrderDate: line.purchaseOrder.createdAt,
        });
      }
    }

    return Array.from(bySupplier.values())
      .map((s) => ({
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        latestUnitPrice: s.latestUnitPrice,
        latestOrderDate: s.latestOrderDate,
        averageUnitPrice: Math.round((s.prices.reduce((sum, p) => sum + p, 0) / s.prices.length) * 100) / 100,
        orderCount: s.prices.length,
      }))
      .sort((a, b) => a.latestUnitPrice - b.latestUnitPrice);
  }
}
