import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateMaterialCatalogItemInput, ImportResult, UpdateMaterialReorderInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class MaterialCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  /** CSV columns: code (required), name (required), unit (required), defaultUnitPrice (required, numeric). Rows whose code already exists for this company are skipped. */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const existing = await this.prisma.materialCatalogItem.findMany({ where: { companyId }, select: { code: true } });
    const seenCodes = new Set(existing.map((m) => m.code));

    const toCreate: { code: string; name: string; unit: string; defaultUnitPrice: number }[] = [];

    records.forEach((record, index) => {
      const row = index + 2;
      const code = record.code?.trim();
      const name = record.name?.trim();
      const unit = record.unit?.trim();
      const priceRaw = record.defaultunitprice?.trim();
      const price = Number(priceRaw);

      if (!code || !name || !unit || !priceRaw || Number.isNaN(price)) {
        result.skipped++;
        result.errors.push({ row, message: "Missing or invalid code/name/unit/defaultUnitPrice" });
        return;
      }
      if (seenCodes.has(code)) {
        result.skipped++;
        result.errors.push({ row, message: `Code "${code}" already exists` });
        return;
      }
      seenCodes.add(code);
      toCreate.push({ code, name, unit, defaultUnitPrice: price });
    });

    if (toCreate.length > 0) {
      await this.prisma.materialCatalogItem.createMany({ data: toCreate.map((m) => ({ ...m, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "materials.imported",
      "Company",
      companyId,
      `Imported ${result.created} materials from CSV (${result.skipped} skipped)`,
    );

    return result;
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
