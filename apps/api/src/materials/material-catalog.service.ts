import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateMaterialCatalogItemInput,
  ImportResult,
  UpdateMaterialBarcodeInput,
  UpdateMaterialLotTrackedInput,
  UpdateMaterialPriceInput,
  UpdateMaterialReorderInput,
  UpdateMaterialSustainabilityInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { calculatePriceChangePercent, isSignificantPriceChange, round2 } from "./price-change";

@Injectable()
export class MaterialCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
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

  /** Updates the catalog price and, only when the move is significant (see price-change.ts),
   * logs a MaterialPriceChange — which is what feeds the notification and the affected-estimates
   * lookup. A minor tweak still updates the price but leaves no trace, same as before this
   * feature existed. */
  async updatePrice(companyId: string, actor: AuditActor, id: string, input: UpdateMaterialPriceInput) {
    const item = await this.get(companyId, id);
    const oldPrice = Number(item.defaultUnitPrice);
    const newPrice = input.defaultUnitPrice;
    const changePercent = calculatePriceChangePercent(oldPrice, newPrice);

    const significant = isSignificantPriceChange(changePercent);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.materialCatalogItem.update({
        where: { id },
        data: { defaultUnitPrice: newPrice },
        include: { preferredSupplier: true },
      });

      if (significant) {
        const change = await tx.materialPriceChange.create({
          data: { companyId, materialCatalogItemId: id, oldPrice, newPrice, changePercent, changedByUserId: actor.userId, changedByName: actor.name },
        });
        await this.outbox.enqueue(tx, companyId, "material.price_changed", { materialCatalogItemId: id, changeId: change.id, changePercent, oldPrice, newPrice });
      }
      return updated;
    });

    if (significant) {
      this.audit.record(
        companyId,
        actor,
        "material.price_changed",
        "MaterialCatalogItem",
        id,
        `"${item.name}" price ${changePercent > 0 ? "rose" : "fell"} ${Math.abs(changePercent)}% (${oldPrice} → ${newPrice})`,
      );
    }

    return updated;
  }

  /** Recent significant price changes, newest first — the notification bell's data source. */
  priceChanges(companyId: string, sinceDays = 14) {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return this.prisma.materialPriceChange.findMany({
      where: { companyId, createdAt: { gte: cutoff } },
      include: { materialCatalogItem: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Draft estimates (not yet approved/sent — nothing to warn about on a finished document) whose
   * lines use a rate item this material feeds into, so a price swing after they were priced out
   * is visible before the client sees a now-outdated number. */
  async affectedOpenEstimates(companyId: string, materialCatalogItemId: string) {
    await this.get(companyId, materialCatalogItemId);
    const rateItemLinks = await this.prisma.rateCatalogItemMaterial.findMany({
      where: { materialCatalogItemId },
      select: { rateCatalogItemId: true },
    });
    const rateCatalogItemIds = rateItemLinks.map((l) => l.rateCatalogItemId);
    if (rateCatalogItemIds.length === 0) return [];

    const estimates = await this.prisma.estimate.findMany({
      where: {
        companyId,
        isTemplate: false,
        status: { in: ["draft", "pending_approval"] },
        lines: { some: { rateCatalogItemId: { in: rateCatalogItemIds } } },
      },
      select: { id: true, name: true, grandTotal: true, project: { select: { id: true, name: true } } },
    });
    return estimates.map((e) => ({ id: e.id, name: e.name, grandTotal: round2(Number(e.grandTotal)), project: e.project }));
  }

  async updateSustainability(companyId: string, id: string, input: UpdateMaterialSustainabilityInput) {
    await this.get(companyId, id);
    return this.prisma.materialCatalogItem.update({
      where: { id },
      data: input,
      include: { preferredSupplier: true },
    });
  }

  async updateBarcode(companyId: string, id: string, input: UpdateMaterialBarcodeInput) {
    await this.get(companyId, id);
    return this.prisma.materialCatalogItem.update({
      where: { id },
      data: { barcode: input.barcode },
      include: { preferredSupplier: true },
    });
  }

  /** Toggles lot/batch tracking for this material — see MaterialCatalogItem.lotTracked. Turning it
   * off doesn't retroactively delete any StockLot rows already created; it only stops requiring a
   * lotNumber on future receipts and stops FEFO lot consumption on future issues. */
  async updateLotTracked(companyId: string, id: string, input: UpdateMaterialLotTrackedInput) {
    await this.get(companyId, id);
    return this.prisma.materialCatalogItem.update({
      where: { id },
      data: { lotTracked: input.lotTracked },
      include: { preferredSupplier: true },
    });
  }

  /** Scan-to-identify lookup for receiving/counting workflows — includes stock levels (with any
   * per-warehouse bin location) so a scan answers both "what is this" and "where does it go." */
  async findByBarcode(companyId: string, barcode: string) {
    const item = await this.prisma.materialCatalogItem.findFirst({
      where: { companyId, barcode },
      include: { preferredSupplier: true, stockLevels: { include: { warehouse: true } } },
    });
    if (!item) throw new NotFoundException("No material found for this barcode");
    return item;
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
