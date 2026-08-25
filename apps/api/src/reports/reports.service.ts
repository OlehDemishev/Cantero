import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { computeCriticalPath, type DependencyForCpm, type TaskForCpm } from "../projects/critical-path";
import { advanceDate, calculateRecurringInvoice } from "../finance/recurring-invoice-schedule";
import { calculateEac } from "./estimate-at-completion";

const CASH_FLOW_WEEKS = 13;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
   * Estimate-at-completion per project: standard EVM forecast of total cost and margin if the
   * remaining work continues at the same cost efficiency observed so far. `percentComplete` is
   * read from the furthest progress-billing draw on the project (see Phase 60's Invoice
   * .percentComplete) — projects with no progress draws yet report 0% and the EAC conservatively
   * assumes on-budget completion until real progress data exists.
   */
  async estimateAtCompletion(companyId: string) {
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      include: {
        estimates: { where: { status: "approved" } },
        invoices: true,
        stockMovements: { where: { type: { in: ["issue", "write_off"] } }, include: { materialCatalogItem: true } },
        timeEntries: { include: { worker: true } },
        subcontractorCosts: true,
      },
      orderBy: { name: "asc" },
    });

    return projects.map((project) => {
      const contractValue = project.estimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);
      const budgetedCost = project.estimates.reduce(
        (sum, e) => sum + Number(e.materialsCostTotal) + Number(e.laborCostTotal),
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

      const percentComplete = project.invoices.reduce(
        (max, inv) => (inv.percentComplete !== null ? Math.max(max, Number(inv.percentComplete)) : max),
        0,
      );

      const eac = calculateEac({ contractValue, budgetedCost, actualCost, percentComplete });

      return {
        projectId: project.id,
        projectName: project.name,
        contractValue: round2(contractValue),
        budgetedCost: round2(budgetedCost),
        actualCost: round2(actualCost),
        percentComplete,
        ...eac,
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

  /**
   * Leadership single-glance rollup across every project: budget health plus the operational
   * risk signals scattered across the Phase 36-41 modules (open RFIs, unresolved punch items,
   * submittals awaiting action, logged incidents, and anything overdue on the critical path).
   * "At risk" is deliberately narrow — an incomplete critical-path task past its due date is the
   * one signal that's unambiguously a schedule problem, not just busy.
   */
  async portfolio(companyId: string) {
    const now = new Date();
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      include: {
        client: { select: { name: true } },
        estimates: { where: { status: "approved" } },
        stockMovements: { where: { type: { in: ["issue", "write_off"] } }, include: { materialCatalogItem: true } },
        timeEntries: { include: { worker: true } },
        subcontractorCosts: true,
        tasks: true,
        rfis: true,
        punchListItems: true,
        submittals: true,
        incidentReports: true,
      },
      orderBy: { name: "asc" },
    });

    const dependencyEdges = await this.prisma.taskDependency.findMany({
      where: { predecessor: { project: { companyId } } },
      select: { predecessorId: true, successorId: true, type: true, lagDays: true, predecessor: { select: { projectId: true } } },
    });
    const dependenciesByProject = new Map<string, DependencyForCpm[]>();
    for (const edge of dependencyEdges) {
      const list = dependenciesByProject.get(edge.predecessor.projectId) ?? [];
      list.push({ predecessorId: edge.predecessorId, successorId: edge.successorId, type: edge.type, lagDays: edge.lagDays });
      dependenciesByProject.set(edge.predecessor.projectId, list);
    }

    const rows = projects.map((project) => {
      const budgetTotal = project.estimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);
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
      const actualTotal = materialsCostActual + laborCostActual + subcontractorCostActual;

      // Only the latest revision per submittal chain counts — a superseded draft/rejected
      // revision isn't itself pending anything.
      const latestSubmittalByChain = new Map<string, (typeof project.submittals)[number]>();
      for (const s of project.submittals) {
        const chainKey = s.rootSubmittalId ?? s.id;
        const existing = latestSubmittalByChain.get(chainKey);
        if (!existing || s.revision > existing.revision) latestSubmittalByChain.set(chainKey, s);
      }
      const pendingSubmittalCount = Array.from(latestSubmittalByChain.values()).filter(
        (s) => s.status !== "approved" && s.status !== "approved_as_noted",
      ).length;

      const datedTasks = project.tasks.filter((t) => t.startDate && t.dueDate);
      const cpmResults =
        datedTasks.length > 0
          ? computeCriticalPath(
              datedTasks.map((t): TaskForCpm => ({ id: t.id, startDate: t.startDate!, dueDate: t.dueDate! })),
              dependenciesByProject.get(project.id) ?? [],
            )
          : [];
      const criticalIds = new Set(cpmResults.filter((r) => r.critical).map((r) => r.id));
      const overdueCriticalTaskCount = project.tasks.filter(
        (t) => criticalIds.has(t.id) && t.status !== "done" && t.dueDate! < now,
      ).length;
      const overdueTaskCount = project.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== "done").length;

      const openRfiCount = project.rfis.filter((r) => r.status !== "closed").length;
      const openPunchListCount = project.punchListItems.filter((p) => p.status !== "verified").length;
      const incidentCount = project.incidentReports.length;

      return {
        id: project.id,
        name: project.name,
        clientName: project.client?.name ?? null,
        budgetTotal: round2(budgetTotal),
        actualTotal: round2(actualTotal),
        variance: round2(budgetTotal - actualTotal),
        openRfiCount,
        openPunchListCount,
        pendingSubmittalCount,
        incidentCount,
        overdueTaskCount,
        criticalTaskCount: criticalIds.size,
        overdueCriticalTaskCount,
        atRisk: overdueCriticalTaskCount > 0,
      };
    });

    const summary = rows.reduce(
      (acc, r) => ({
        projectsTotal: acc.projectsTotal + 1,
        projectsAtRisk: acc.projectsAtRisk + (r.atRisk ? 1 : 0),
        budgetTotal: round2(acc.budgetTotal + r.budgetTotal),
        actualTotal: round2(acc.actualTotal + r.actualTotal),
        varianceTotal: round2(acc.varianceTotal + r.variance),
        openRfiTotal: acc.openRfiTotal + r.openRfiCount,
        openPunchListTotal: acc.openPunchListTotal + r.openPunchListCount,
        pendingSubmittalTotal: acc.pendingSubmittalTotal + r.pendingSubmittalCount,
        incidentTotal: acc.incidentTotal + r.incidentCount,
        overdueTaskTotal: acc.overdueTaskTotal + r.overdueTaskCount,
      }),
      {
        projectsTotal: 0,
        projectsAtRisk: 0,
        budgetTotal: 0,
        actualTotal: 0,
        varianceTotal: 0,
        openRfiTotal: 0,
        openPunchListTotal: 0,
        pendingSubmittalTotal: 0,
        incidentTotal: 0,
        overdueTaskTotal: 0,
      },
    );

    return { projects: rows, summary };
  }

  /**
   * A standard 13-week cash flow forecast: known future inflows (outstanding sent invoices,
   * projected upcoming recurring-invoice generations) against known future outflows (unpaid
   * subcontractor costs, pending/ordered purchase orders), bucketed by week. Payroll/labor isn't
   * projected — TimeEntry only records hours already worked, not a forward schedule, so there's
   * no clean data source for future labor cost the way there is a dueDate/expectedDate for money.
   * There's no tracked bank balance in this system, so this reports flow, not an absolute balance:
   * cumulativeNet assumes a starting position of 0 today.
   */
  async cashFlowForecast(companyId: string) {
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowEnd = new Date(windowStart.getTime() + CASH_FLOW_WEEKS * WEEK_MS);

    const [invoices, recurringInvoices, subcontractorCosts, purchaseOrders] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, status: "sent" }, include: { payments: true } }),
      this.prisma.recurringInvoice.findMany({ where: { companyId, active: true }, include: { lines: true } }),
      this.prisma.subcontractorCost.findMany({ where: { companyId, paid: false } }),
      this.prisma.purchaseOrder.findMany({ where: { companyId, status: { in: ["draft", "ordered"] } }, include: { lines: true } }),
    ]);

    const buckets = Array.from({ length: CASH_FLOW_WEEKS }, (_, i) => {
      const weekStart = new Date(windowStart.getTime() + i * WEEK_MS);
      return {
        weekStart,
        weekEnd: new Date(weekStart.getTime() + WEEK_MS),
        invoicesInflow: 0,
        recurringInflow: 0,
        subcontractorOutflow: 0,
        purchaseOrderOutflow: 0,
      };
    });

    // Anything already past due still gets collapsed into the current week ("expected any time
    // now") rather than dropped — only a genuinely unscheduled (no date at all) amount is excluded
    // from the buckets, and even then it's surfaced separately, not silently lost.
    const bucketIndexFor = (date: Date) =>
      date.getTime() < windowStart.getTime() ? 0 : Math.floor((date.getTime() - windowStart.getTime()) / WEEK_MS);

    let unscheduledInflow = 0;
    let unscheduledOutflow = 0;

    for (const inv of invoices) {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Number(inv.total) - paid;
      if (outstanding <= 0.01) continue;
      if (!inv.dueDate) {
        unscheduledInflow += outstanding;
        continue;
      }
      const idx = bucketIndexFor(inv.dueDate);
      if (idx < CASH_FLOW_WEEKS) buckets[idx].invoicesInflow += outstanding;
    }

    for (const recurring of recurringInvoices) {
      if (recurring.lines.length === 0) continue;
      const calc = calculateRecurringInvoice(
        recurring.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        Number(recurring.taxPercent),
      );
      // An overdue nextRunDate (the background job hasn't caught up yet) collapses to "due now"
      // rather than replaying every missed cycle into week 0.
      let occurrence = recurring.nextRunDate.getTime() < windowStart.getTime() ? windowStart : recurring.nextRunDate;
      let iterations = 0;
      while (occurrence.getTime() < windowEnd.getTime() && iterations < 60) {
        iterations++;
        if (recurring.endDate && occurrence.getTime() > recurring.endDate.getTime()) break;
        const idx = bucketIndexFor(occurrence);
        if (idx < CASH_FLOW_WEEKS) buckets[idx].recurringInflow += calc.total;
        occurrence = advanceDate(occurrence, recurring.frequency);
      }
    }

    for (const cost of subcontractorCosts) {
      const amount = Number(cost.amount);
      if (!cost.dueDate) {
        unscheduledOutflow += amount;
        continue;
      }
      const idx = bucketIndexFor(cost.dueDate);
      if (idx < CASH_FLOW_WEEKS) buckets[idx].subcontractorOutflow += amount;
    }

    for (const po of purchaseOrders) {
      const amount = po.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
      if (amount <= 0) continue;
      if (!po.expectedDate) {
        unscheduledOutflow += amount;
        continue;
      }
      const idx = bucketIndexFor(po.expectedDate);
      if (idx < CASH_FLOW_WEEKS) buckets[idx].purchaseOrderOutflow += amount;
    }

    let cumulativeNet = 0;
    const weeks = buckets.map((b) => {
      const inflow = b.invoicesInflow + b.recurringInflow;
      const outflow = b.subcontractorOutflow + b.purchaseOrderOutflow;
      const net = inflow - outflow;
      cumulativeNet += net;
      return {
        weekStart: b.weekStart.toISOString(),
        weekEnd: b.weekEnd.toISOString(),
        inflow: round2(inflow),
        outflow: round2(outflow),
        net: round2(net),
        cumulativeNet: round2(cumulativeNet),
        inflowBreakdown: { invoices: round2(b.invoicesInflow), recurring: round2(b.recurringInflow) },
        outflowBreakdown: { subcontractors: round2(b.subcontractorOutflow), purchaseOrders: round2(b.purchaseOrderOutflow) },
      };
    });

    const totalInflow = weeks.reduce((sum, w) => sum + w.inflow, 0);
    const totalOutflow = weeks.reduce((sum, w) => sum + w.outflow, 0);

    return {
      windowWeeks: CASH_FLOW_WEEKS,
      generatedAt: now.toISOString(),
      unscheduledInflow: round2(unscheduledInflow),
      unscheduledOutflow: round2(unscheduledOutflow),
      weeks,
      totals: { inflow: round2(totalInflow), outflow: round2(totalOutflow), net: round2(totalInflow - totalOutflow) },
    };
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
