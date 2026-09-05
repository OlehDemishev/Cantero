import { Injectable, NotFoundException } from "@nestjs/common";
import type { AddSupplierDocumentInput, CreateSupplierInput, CreateSupplierReviewInput, ImportResult } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { parseCsvRecords } from "../common/csv";
import { calculatePriceVariance } from "./price-variance";

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  create(companyId: string, input: CreateSupplierInput) {
    return this.prisma.supplier.create({ data: { ...input, companyId } });
  }

  /** On-time rate and spend are computed from every received purchase order — "on time" means
   * received at or before the promised expectedDate. Orders with no expectedDate or not yet
   * received are excluded from the on-time rate but still counted in totalOrders/totalSpend.
   * averageRating/wouldReorderPercent are the one dimension PO data can't answer (a subjective
   * "would we order from them again"), rolled up at read time from SupplierReview — same
   * reasoning as SubcontractorsService.performanceScorecard(): no cached/denormalized score.
   * averagePriceVariancePercent compares every PO line's unitPrice against that material's
   * *current* MaterialCatalogItem.defaultUnitPrice — the catalog price may have moved since the
   * order was placed, so this reads as "how this supplier prices against today's benchmark," not
   * a point-in-time-accurate variance — quantity-weighted so a handful of small orders can't
   * swing it as much as the bulk of actual spend. See calculatePriceVariance. */
  async scorecard(companyId: string, id: string) {
    await this.get(companyId, id);

    const [orders, reviews] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { companyId, supplierId: id },
        include: { lines: { include: { materialCatalogItem: { select: { defaultUnitPrice: true } } } } },
      }),
      this.prisma.supplierReview.findMany({ where: { companyId, supplierId: id } }),
    ]);

    const received = orders.filter((o) => o.receivedAt);
    const withPromise = received.filter((o) => o.expectedDate);
    const onTime = withPromise.filter((o) => o.receivedAt! <= o.expectedDate!);
    const delaysDays = withPromise.map((o) => (o.receivedAt!.getTime() - o.expectedDate!.getTime()) / 86_400_000);

    const totalSpend = orders.reduce(
      (sum, o) => sum + o.lines.reduce((lineSum, l) => lineSum + Number(l.quantity) * Number(l.unitPrice), 0),
      0,
    );

    const priceVarianceLines = orders.flatMap((o) =>
      o.lines.map((l) => ({ unitPrice: Number(l.unitPrice), quantity: Number(l.quantity), catalogPrice: Number(l.materialCatalogItem.defaultUnitPrice) })),
    );

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const reorderAnswered = reviews.filter((r) => r.wouldReorder !== null);

    return {
      totalOrders: orders.length,
      receivedOrders: received.length,
      totalSpend,
      onTimeRate: withPromise.length > 0 ? onTime.length / withPromise.length : null,
      averageDelayDays: delaysDays.length > 0 ? delaysDays.reduce((a, b) => a + b, 0) / delaysDays.length : null,
      reviewCount: reviews.length,
      averageRating: reviews.length > 0 ? round1(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) : null,
      wouldReorderPercent:
        reorderAnswered.length > 0 ? round1((reorderAnswered.filter((r) => r.wouldReorder).length / reorderAnswered.length) * 100) : null,
      averagePriceVariancePercent: calculatePriceVariance(priceVarianceLines),
    };
  }

  listDocuments(companyId: string, supplierId: string) {
    return this.prisma.supplierDocument.findMany({ where: { companyId, supplierId }, orderBy: { expiresAt: "asc" } });
  }

  async addDocument(companyId: string, actor: AuditActor, supplierId: string, input: AddSupplierDocumentInput) {
    const supplier = await this.get(companyId, supplierId);
    const doc = await this.prisma.supplierDocument.create({
      data: { companyId, supplierId, type: input.type, name: input.name, expiresAt: new Date(input.expiresAt) },
    });
    this.audit.record(
      companyId,
      actor,
      "supplier_document.added",
      "SupplierDocument",
      doc.id,
      `Added ${input.type.replace(/_/g, " ")} for "${supplier.name}", expires ${doc.expiresAt.toLocaleDateString()}`,
    );
    return doc;
  }

  async deleteDocument(companyId: string, supplierId: string, documentId: string) {
    const doc = await this.prisma.supplierDocument.findFirst({ where: { id: documentId, supplierId, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.supplierDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  listReviews(companyId: string, supplierId: string) {
    return this.prisma.supplierReview.findMany({ where: { companyId, supplierId }, orderBy: { createdAt: "desc" } });
  }

  async addReview(companyId: string, actor: AuditActor, supplierId: string, input: CreateSupplierReviewInput) {
    const supplier = await this.get(companyId, supplierId);
    const review = await this.prisma.supplierReview.create({
      data: {
        companyId,
        supplierId,
        reviewedByUserId: actor.userId,
        reviewedByName: actor.name,
        rating: input.rating,
        wouldReorder: input.wouldReorder,
        comments: input.comments,
      },
    });
    this.audit.record(companyId, actor, "supplier.reviewed", "Supplier", supplierId, `Rated "${supplier.name}" ${input.rating}/5`);
    return review;
  }

  /** Bulk price update from a supplier's own price list — CSV columns: code, unitPrice. Only
   * touches MaterialCatalogItem rows where this supplier is already the preferredSupplierId, so
   * a mismatched or wrong-vendor CSV can't silently reprice unrelated materials. */
  async syncCatalog(companyId: string, supplierId: string, csv: string): Promise<ImportResult> {
    await this.get(companyId, supplierId);
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const items = await this.prisma.materialCatalogItem.findMany({
      where: { companyId, preferredSupplierId: supplierId },
      select: { id: true, code: true },
    });
    const itemIdByCode = new Map(items.map((i) => [i.code.trim().toLowerCase(), i.id]));

    for (const [index, record] of records.entries()) {
      const row = index + 2; // header is row 1
      const code = record.code?.trim();
      // parseCsvRecords keys every field by lowercased header, so "unitPrice" in the CSV header
      // arrives here as record.unitprice.
      const unitPrice = Number(record.unitprice);
      if (!code || !Number.isFinite(unitPrice) || unitPrice < 0) {
        result.skipped++;
        result.errors.push({ row, message: "Missing code or invalid unitPrice" });
        continue;
      }
      const itemId = itemIdByCode.get(code.toLowerCase());
      if (!itemId) {
        result.skipped++;
        result.errors.push({ row, message: `No material with code "${code}" has this supplier as preferred` });
        continue;
      }
      await this.prisma.materialCatalogItem.update({ where: { id: itemId }, data: { defaultUnitPrice: unitPrice } });
      result.created++;
    }

    return result;
  }
}
