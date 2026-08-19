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

  /**
   * Per-project margin: invoiced revenue vs actual cost (materials consumed +
   * labor, valued like Finance's budget-vs-actual, + subcontractor cost).
   * Budget is the sum of approved estimates, shown alongside for context but
   * margin itself is computed against actuals, not budget.
   */
  async projectMargins(companyId: string) {
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      include: {
        estimates: { where: { status: "approved" } },
        invoices: { include: { payments: true } },
        stockMovements: { where: { type: { in: ["issue", "write_off"] } }, include: { materialCatalogItem: true } },
        timeEntries: { include: { worker: true } },
        subcontractorCosts: true,
      },
      orderBy: { name: "asc" },
    });

    return projects.map((project) => {
      const budgetTotal = project.estimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);
      const invoicedTotal = project.invoices.reduce((sum, i) => sum + Number(i.total), 0);
      const paidTotal = project.invoices.reduce(
        (sum, i) => sum + i.payments.reduce((s, p) => s + Number(p.amount), 0),
        0,
      );

      const materialsCostActual = project.stockMovements.reduce(
        (sum, m) => sum + Number(m.quantity) * Number(m.materialCatalogItem.defaultUnitPrice),
        0,
      );
      const laborCostActual = project.timeEntries.reduce((sum, entry) => {
        const rate =
          entry.hourlyCostSnapshot !== null
            ? Number(entry.hourlyCostSnapshot)
            : entry.worker.hourlyCost !== null
              ? Number(entry.worker.hourlyCost)
              : 0;
        return sum + Number(entry.hours) * rate;
      }, 0);
      const subcontractorCostActual = project.subcontractorCosts.reduce((sum, c) => sum + Number(c.amount), 0);

      const actualCost = materialsCostActual + laborCostActual + subcontractorCostActual;
      const margin = invoicedTotal - actualCost;

      return {
        projectId: project.id,
        projectName: project.name,
        budgetTotal: round2(budgetTotal),
        invoicedTotal: round2(invoicedTotal),
        paidTotal: round2(paidTotal),
        actualCost: round2(actualCost),
        margin: round2(margin),
        marginPercent: invoicedTotal > 0 ? round2((margin / invoicedTotal) * 100) : null,
      };
    });
  }

  /**
   * Per-material consumption (issue + write_off) vs current stock on hand,
   * across all warehouses. A material with stock on hand but zero
   * consumption is flagged slow-moving — capital sitting idle in the warehouse.
   */
  async warehouseTurnover(companyId: string) {
    const materials = await this.prisma.materialCatalogItem.findMany({
      where: { companyId },
      include: {
        stockLevels: true,
        stockMovements: { where: { type: { in: ["issue", "write_off"] } } },
      },
      orderBy: { code: "asc" },
    });

    return materials
      .map((m) => {
        const onHand = m.stockLevels.reduce((sum, l) => sum + Number(l.quantityOnHand), 0);
        const consumed = m.stockMovements.reduce((sum, mv) => sum + Number(mv.quantity), 0);
        return {
          materialId: m.id,
          code: m.code,
          name: m.name,
          unit: m.unit,
          onHand: round2(onHand),
          consumed: round2(consumed),
          turnoverRatio: onHand > 0 ? round2(consumed / onHand) : null,
          slowMoving: onHand > 0 && consumed === 0,
        };
      })
      .filter((m) => m.onHand !== 0 || m.consumed !== 0)
      .sort((a, b) => b.consumed - a.consumed);
  }

  /**
   * Accounts-receivable aging for outstanding (unpaid/partially paid, non-void)
   * invoices, bucketed by days past due date. DSO is approximated over the
   * trailing 90 days: total outstanding ÷ (invoiced in the last 90 days ÷ 90).
   */
  async invoiceAging(companyId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: "void" } },
      include: { payments: true, client: true },
    });

    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    const outstandingInvoices: {
      invoiceId: string;
      number: string;
      clientName: string;
      total: number;
      outstanding: number;
      daysOverdue: number | null;
    }[] = [];
    let totalOutstanding = 0;

    for (const inv of invoices) {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Number(inv.total) - paid;
      if (outstanding <= 0.01) continue;

      totalOutstanding += outstanding;
      const daysOverdue = inv.dueDate ? Math.floor((now.getTime() - inv.dueDate.getTime()) / msPerDay) : null;

      if (daysOverdue === null || daysOverdue <= 0) buckets.current += outstanding;
      else if (daysOverdue <= 30) buckets.days1to30 += outstanding;
      else if (daysOverdue <= 60) buckets.days31to60 += outstanding;
      else if (daysOverdue <= 90) buckets.days61to90 += outstanding;
      else buckets.days90plus += outstanding;

      outstandingInvoices.push({
        invoiceId: inv.id,
        number: inv.number,
        clientName: inv.client.name,
        total: round2(Number(inv.total)),
        outstanding: round2(outstanding),
        daysOverdue,
      });
    }

    const periodStart = new Date(now.getTime() - 90 * msPerDay);
    const invoicedLast90Days = invoices
      .filter((inv) => inv.createdAt >= periodStart)
      .reduce((sum, inv) => sum + Number(inv.total), 0);
    const dso = invoicedLast90Days > 0 ? round2((totalOutstanding / (invoicedLast90Days / 90)) * 1) : null;

    return {
      totalOutstanding: round2(totalOutstanding),
      dso,
      buckets: {
        current: round2(buckets.current),
        days1to30: round2(buckets.days1to30),
        days31to60: round2(buckets.days31to60),
        days61to90: round2(buckets.days61to90),
        days90plus: round2(buckets.days90plus),
      },
      invoices: outstandingInvoices.sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1)),
    };
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
