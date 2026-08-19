import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

/** Company-wide overview spanning every module — the "everything in one place" story for the dashboard. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(companyId: string) {
    const [
      projectsTotal,
      estimatesByStatus,
      invoices,
      clientsByStage,
      workersTotal,
      stockLevels,
      materials,
    ] = await Promise.all([
      this.prisma.project.count({ where: { companyId } }),
      this.prisma.estimate.groupBy({ by: ["status"], where: { companyId }, _count: true }),
      this.prisma.invoice.findMany({ where: { companyId }, include: { payments: true } }),
      this.prisma.client.groupBy({ by: ["stage"], where: { companyId }, _count: true }),
      this.prisma.worker.count({ where: { companyId } }),
      this.prisma.stockLevel.findMany({ where: { warehouse: { companyId } }, include: { materialCatalogItem: true } }),
      this.prisma.materialCatalogItem.findMany({ where: { companyId, reorderThreshold: { not: null } } }),
    ]);

    const estimates = { total: 0, draft: 0, approved: 0 };
    for (const row of estimatesByStatus) {
      estimates.total += row._count;
      estimates[row.status as "draft" | "approved"] = row._count;
    }

    const invoiceStats = { total: invoices.length, draft: 0, sent: 0, paid: 0, void: 0, totalValue: 0, paidValue: 0 };
    for (const inv of invoices) {
      invoiceStats[inv.status] += 1;
      invoiceStats.totalValue += Number(inv.total);
      invoiceStats.paidValue += inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    }

    const clients = { total: 0, lead: 0, contacted: 0, qualified: 0, won: 0, lost: 0 };
    for (const row of clientsByStage) {
      clients.total += row._count;
      clients[row.stage as "lead" | "contacted" | "qualified" | "won" | "lost"] = row._count;
    }

    const stockValue = stockLevels.reduce(
      (sum, level) => sum + Number(level.quantityOnHand) * Number(level.materialCatalogItem.defaultUnitPrice),
      0,
    );

    // Low-stock: sum quantity on hand per material across warehouses, compare to its threshold.
    const onHandByMaterial = new Map<string, number>();
    for (const level of stockLevels) {
      onHandByMaterial.set(
        level.materialCatalogItemId,
        (onHandByMaterial.get(level.materialCatalogItemId) ?? 0) + Number(level.quantityOnHand),
      );
    }
    const lowStockCount = materials.filter(
      (m) => (onHandByMaterial.get(m.id) ?? 0) < Number(m.reorderThreshold),
    ).length;

    return {
      projectsTotal,
      estimates,
      invoices: {
        ...invoiceStats,
        totalValue: round2(invoiceStats.totalValue),
        paidValue: round2(invoiceStats.paidValue),
        outstandingValue: round2(invoiceStats.totalValue - invoiceStats.paidValue),
      },
      clients,
      workersTotal,
      materials: { stockValue: round2(stockValue), lowStockCount },
    };
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
