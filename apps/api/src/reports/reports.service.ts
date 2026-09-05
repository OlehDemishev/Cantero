import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { computeCriticalPath, type DependencyForCpm, type TaskForCpm } from "../projects/critical-path";
import { advanceDate, calculateRecurringInvoice } from "../finance/recurring-invoice-schedule";
import { calculateEac } from "./estimate-at-completion";
import { calculateWinRate, type WinRateEstimateInput } from "./win-rate";
import { toCsv } from "../common/csv";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const CASH_FLOW_WEEKS = 13;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Company-wide overview spanning every module — the "everything in one place" story for the dashboard. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

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
   * Bid outcome analytics from the estimate client-decision data that already exists (sent →
   * approved/rejected/countered) — this report doesn't add a new outcome field, it just slices
   * decisions that were already being recorded. Margin bands use the estimate's own markupPercent
   * as a proxy for how aggressively it was priced; only non-template, non-variant estimates that
   * were actually sent to a client are considered (variants share one sibling's decision via
   * applyDecision(), and a draft estimate hasn't been offered to anyone to win or lose yet).
   */
  async winRateReport(companyId: string) {
    const estimates = await this.prisma.estimate.findMany({
      where: { companyId, isTemplate: false, variantOfId: null, sentAt: { not: null } },
      select: { clientDecision: true, grandTotal: true, markupPercent: true, sentAt: true, decisionAt: true },
    });

    const toWinRateInput = (e: (typeof estimates)[number]): WinRateEstimateInput => ({
      clientDecision: e.clientDecision,
      grandTotal: Number(e.grandTotal),
      sentAt: e.sentAt,
      decisionAt: e.decisionAt,
    });

    const overall = calculateWinRate(estimates.map(toWinRateInput));

    const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const byMonthMap = new Map<string, (typeof estimates)[number][]>();
    for (const e of estimates) {
      if (!e.sentAt) continue;
      const key = monthKey(e.sentAt);
      byMonthMap.set(key, [...(byMonthMap.get(key) ?? []), e]);
    }
    const byMonth = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, group]) => ({ month, ...calculateWinRate(group.map(toWinRateInput)) }));

    const marginBand = (markupPercent: number) => (markupPercent < 10 ? "<10%" : markupPercent < 20 ? "10-20%" : "20%+");
    const byMarginBandMap = new Map<string, (typeof estimates)[number][]>();
    for (const e of estimates) {
      const band = marginBand(Number(e.markupPercent));
      byMarginBandMap.set(band, [...(byMarginBandMap.get(band) ?? []), e]);
    }
    const byMarginBand = ["<10%", "10-20%", "20%+"]
      .filter((band) => byMarginBandMap.has(band))
      .map((band) => ({ band, ...calculateWinRate(byMarginBandMap.get(band)!.map(toWinRateInput)) }));

    return { overall, byMonth, byMarginBand };
  }

  /**
   * Standard construction WIP (work-in-progress) schedule — the percentage-of-completion revenue
   * recognition report a bank or bonding company asks for. Percent complete uses the cost-to-cost
   * method (costs incurred / total estimated cost) rather than the billing-based percentComplete
   * used elsewhere in this file, since that's the GAAP-standard basis for this specific report;
   * "total estimated cost" is the larger of the original budget and the EAC, so a project running
   * over budget doesn't show over 100% complete. Only projects with an approved estimate (i.e. an
   * actual contract value) are included — nothing to recognize revenue against otherwise.
   *
   * Known scope limit: each project's own contractValue/earned/billed figures are correct in that
   * project's own currency (see Project.currency), but this report lists every project side by
   * side under one company-wide "Currency" label without converting — same limit cashFlowForecast
   * documents. A company running a project in an override currency will see that row's numbers
   * under the company's default currency label, not its own.
   */
  async wipReport(companyId: string) {
    const projects = await this.prisma.project.findMany({
      where: { companyId, estimates: { some: { status: "approved" } } },
      include: {
        estimates: { where: { status: "approved" } },
        invoices: true,
        stockMovements: { where: { type: { in: ["issue", "write_off"] } }, include: { materialCatalogItem: true } },
        timeEntries: { include: { worker: true } },
        subcontractorCosts: true,
      },
      orderBy: { name: "asc" },
    });

    const rows = projects.map((project) => {
      const contractValue = project.estimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);
      const originalBudgetedCost = project.estimates.reduce(
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
      const costsIncurredToDate = materialsCostActual + laborCostActual + subcontractorCostActual;

      const billingPercentComplete = project.invoices.reduce(
        (max, inv) => (inv.percentComplete !== null ? Math.max(max, Number(inv.percentComplete)) : max),
        0,
      );
      const eac = calculateEac({
        contractValue,
        budgetedCost: originalBudgetedCost,
        actualCost: costsIncurredToDate,
        percentComplete: billingPercentComplete,
      });
      const totalEstimatedCost = Math.max(originalBudgetedCost, eac.estimateAtCompletion);

      const percentComplete = totalEstimatedCost > 0 ? round2((costsIncurredToDate / totalEstimatedCost) * 100) : 0;
      const earnedRevenue = round2(contractValue * (percentComplete / 100));
      const billedToDate = round2(project.invoices.reduce((sum, i) => sum + Number(i.total), 0));
      const overUnderBilling = round2(billedToDate - earnedRevenue);

      return {
        projectId: project.id,
        projectName: project.name,
        contractValue: round2(contractValue),
        totalEstimatedCost: round2(totalEstimatedCost),
        costsIncurredToDate: round2(costsIncurredToDate),
        percentComplete,
        earnedRevenue,
        billedToDate,
        overUnderBilling,
        status: overUnderBilling > 0.01 ? ("overbilled" as const) : overUnderBilling < -0.01 ? ("underbilled" as const) : ("even" as const),
      };
    });

    const totals = rows.reduce(
      (sum, r) => ({
        contractValue: sum.contractValue + r.contractValue,
        costsIncurredToDate: sum.costsIncurredToDate + r.costsIncurredToDate,
        earnedRevenue: sum.earnedRevenue + r.earnedRevenue,
        billedToDate: sum.billedToDate + r.billedToDate,
        overUnderBilling: sum.overUnderBilling + r.overUnderBilling,
      }),
      { contractValue: 0, costsIncurredToDate: 0, earnedRevenue: 0, billedToDate: 0, overUnderBilling: 0 },
    );

    return { rows, totals: { ...totals, contractValue: round2(totals.contractValue), costsIncurredToDate: round2(totals.costsIncurredToDate), earnedRevenue: round2(totals.earnedRevenue), billedToDate: round2(totals.billedToDate), overUnderBilling: round2(totals.overUnderBilling) } };
  }

  /** Same figures as wipReport(), laid out as the printable schedule a bank or bonding company asks for. */
  /** Approved contract value not yet billed, company-wide — the standard "backlog" KPI. Reuses
   * wipReport's per-project contract/billed totals rather than re-querying. */
  async backlog(companyId: string) {
    const { totals } = await this.wipReport(companyId);
    return { backlog: round2(totals.contractValue - totals.billedToDate), contractValue: totals.contractValue, billedToDate: totals.billedToDate };
  }

  /** Every expiring-document source in the app, in one sorted list — SubcontractorDocument,
   * SupplierDocument, WorkerCertification, Permit, and CompanyDocument each track expiry
   * independently (see their own model comments) and already feed NotificationsService one at a
   * time; this rolls all five into a single calendar view instead of five separate places to
   * check. Already-expired items sort first (their expiresAt is in the past), so the most urgent
   * items are always at the top regardless of lookaheadDays. */
  async complianceCalendar(companyId: string, lookaheadDays = 90) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
    const within = { lte: cutoff };

    const [subDocs, supplierDocs, certs, permits, companyDocs, vehiclesByRegistration, vehiclesByInsurance, driversWithCdl] = await Promise.all([
      this.prisma.subcontractorDocument.findMany({
        where: { companyId, expiresAt: within },
        include: { subcontractor: { select: { name: true } } },
      }),
      this.prisma.supplierDocument.findMany({
        where: { companyId, expiresAt: within },
        include: { supplier: { select: { name: true } } },
      }),
      this.prisma.workerCertification.findMany({
        where: { companyId, expiresAt: within },
        include: { worker: { select: { name: true } } },
      }),
      this.prisma.permit.findMany({
        where: { companyId, expiresAt: within },
        include: { project: { select: { name: true } } },
      }),
      this.prisma.companyDocument.findMany({ where: { companyId, expiresAt: within } }),
      this.prisma.vehicle.findMany({ where: { companyId, registrationExpiresAt: within } }),
      this.prisma.vehicle.findMany({ where: { companyId, insuranceExpiresAt: within } }),
      this.prisma.worker.findMany({ where: { companyId, cdlExpiresAt: within }, select: { name: true, cdlExpiresAt: true } }),
    ]);

    const items = [
      ...subDocs.map((d) => ({
        type: "subcontractor_document" as const,
        label: `${d.type.replace(/_/g, " ")} — ${d.name}`,
        holderName: d.subcontractor.name,
        expiresAt: d.expiresAt,
      })),
      ...supplierDocs.map((d) => ({
        type: "supplier_document" as const,
        label: `${d.type.replace(/_/g, " ")} — ${d.name}`,
        holderName: d.supplier.name,
        expiresAt: d.expiresAt,
      })),
      ...certs.map((c) => ({
        type: "worker_certification" as const,
        label: c.name,
        holderName: c.worker.name,
        expiresAt: c.expiresAt,
      })),
      ...permits.filter((p) => p.expiresAt).map((p) => ({
        type: "permit" as const,
        label: p.permitType,
        holderName: p.project.name,
        expiresAt: p.expiresAt!,
      })),
      ...companyDocs.map((d) => ({
        type: "company_document" as const,
        label: `${d.type.replace(/_/g, " ")} — ${d.name}`,
        holderName: null,
        expiresAt: d.expiresAt,
      })),
      ...vehiclesByRegistration.map((v) => ({
        type: "vehicle_registration" as const,
        label: "Registration",
        holderName: v.name,
        expiresAt: v.registrationExpiresAt!,
      })),
      ...vehiclesByInsurance.map((v) => ({
        type: "vehicle_insurance" as const,
        label: "Insurance",
        holderName: v.name,
        expiresAt: v.insuranceExpiresAt!,
      })),
      ...driversWithCdl.map((w) => ({
        type: "driver_cdl" as const,
        label: "CDL",
        holderName: w.name,
        expiresAt: w.cdlExpiresAt!,
      })),
    ]
      .map((item) => ({ ...item, status: (item.expiresAt < now ? "expired" : "expiring") as "expired" | "expiring" }))
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

    return {
      items,
      expiredCount: items.filter((i) => i.status === "expired").length,
      expiringCount: items.filter((i) => i.status === "expiring").length,
    };
  }

  async wipReportPdf(companyId: string): Promise<Buffer> {
    const [company, { rows, totals }] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.wipReport(companyId),
    ]);
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;
    const currency = company.currency;

    return this.pdf.render({
      title: "Work-in-Progress Schedule",
      subtitle: `${company.name} — as of ${new Date().toISOString().slice(0, 10)}`,
      meta: [{ label: "Currency", value: currency }],
      tableHeader: ["Project", "Contract", "Est. Cost", "Cost to Date", "% Complete", "Earned", "Billed", "Over/(Under)"],
      tableRows: rows.map((r) => ({
        cells: [
          r.projectName,
          r.contractValue.toFixed(2),
          r.totalEstimatedCost.toFixed(2),
          r.costsIncurredToDate.toFixed(2),
          `${r.percentComplete.toFixed(1)}%`,
          r.earnedRevenue.toFixed(2),
          r.billedToDate.toFixed(2),
          r.overUnderBilling.toFixed(2),
        ],
      })),
      totals: [
        { label: "Total contract value", value: totals.contractValue.toFixed(2) },
        { label: "Total costs incurred to date", value: totals.costsIncurredToDate.toFixed(2) },
        { label: "Total earned revenue", value: totals.earnedRevenue.toFixed(2) },
        { label: "Total billed to date", value: totals.billedToDate.toFixed(2) },
        { label: "Net over/(under) billing", value: totals.overUnderBilling.toFixed(2), emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
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
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true } });
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
        invoices: { where: { status: { not: "void" } } },
        drawRequests: true,
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

    const rows = await Promise.all(projects.map(async (project) => {
      // Each project's own figures are computed in its own currency (Project.currency, falling
      // back to the company's), then converted to the company's reporting currency here — the
      // one place this rollup crosses project boundaries, so it's the one place a multi-currency
      // company needs a real conversion instead of adding raw numbers across currencies.
      const projectCurrency = project.currency ?? company.currency;
      const convert = (amount: number) => this.exchangeRates.convert(amount, projectCurrency, company.currency);

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

      const billedToDate = project.invoices.reduce((sum, i) => sum + Number(i.total), 0);
      const fundedDrawIds = new Set(project.drawRequests.filter((d) => d.status === "funded").map((d) => d.invoiceId));
      const fundedToDate = project.invoices.filter((i) => fundedDrawIds.has(i.id)).reduce((sum, i) => sum + Number(i.total), 0);
      const openDrawCount = project.drawRequests.filter((d) => d.status !== "funded").length;

      const [convertedBudgetTotal, convertedActualTotal, convertedBilledToDate, convertedFundedToDate] = await Promise.all([
        convert(budgetTotal),
        convert(actualTotal),
        convert(billedToDate),
        convert(fundedToDate),
      ]);

      return {
        id: project.id,
        name: project.name,
        clientName: project.client?.name ?? null,
        budgetTotal: round2(convertedBudgetTotal),
        actualTotal: round2(convertedActualTotal),
        variance: round2(convertedBudgetTotal - convertedActualTotal),
        openRfiCount,
        openPunchListCount,
        pendingSubmittalCount,
        incidentCount,
        overdueTaskCount,
        criticalTaskCount: criticalIds.size,
        overdueCriticalTaskCount,
        atRisk: overdueCriticalTaskCount > 0,
        billedToDate: round2(convertedBilledToDate),
        fundedToDate: round2(convertedFundedToDate),
        openDrawCount,
      };
    }));

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
        billedToDateTotal: round2(acc.billedToDateTotal + r.billedToDate),
        fundedToDateTotal: round2(acc.fundedToDateTotal + r.fundedToDate),
        openDrawTotal: acc.openDrawTotal + r.openDrawCount,
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
        billedToDateTotal: 0,
        fundedToDateTotal: 0,
        openDrawTotal: 0,
      },
    );

    return { projects: rows, summary, currency: company.currency };
  }

  /**
   * A standard 13-week cash flow forecast: known future inflows (outstanding sent invoices,
   * projected upcoming recurring-invoice generations) against known future outflows (unpaid
   * subcontractor costs, pending/ordered purchase orders), bucketed by week. Payroll/labor isn't
   * projected — TimeEntry only records hours already worked, not a forward schedule, so there's
   * no clean data source for future labor cost the way there is a dueDate/expectedDate for money.
   * There's no tracked bank balance in this system, so this reports flow, not an absolute balance:
   * cumulativeNet assumes a starting position of 0 today.
   *
   * With a `projectId`, scopes to that project instead of the whole company — purchase orders are
   * excluded entirely in that case, since PurchaseOrder restocks a warehouse rather than billing
   * against a specific job (same scope limit JobCostingService documents for material costs).
   *
   * Known scope limit: the company-wide pass (no projectId) sums Invoice/RecurringInvoice amounts
   * as raw numbers without converting a project-currency-override invoice's amount into the
   * company's default first (unlike revenueTrend, which does convert via ExchangeRateService) — a
   * company running one override-currency project alongside its normal ones will see a
   * company-wide forecast that mixes units. Scoping to a single project's own `projectId` isn't
   * affected, since every invoice under one project always shares that project's currency.
   */
  async cashFlowForecast(companyId: string, projectId?: string) {
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowEnd = new Date(windowStart.getTime() + CASH_FLOW_WEEKS * WEEK_MS);

    const [invoices, recurringInvoices, subcontractorCosts, purchaseOrders] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, status: "sent", ...(projectId ? { projectId } : {}) }, include: { payments: true } }),
      this.prisma.recurringInvoice.findMany({ where: { companyId, active: true, ...(projectId ? { projectId } : {}) }, include: { lines: true } }),
      this.prisma.subcontractorCost.findMany({ where: { companyId, paid: false, ...(projectId ? { projectId } : {}) } }),
      projectId
        ? Promise.resolve([])
        : this.prisma.purchaseOrder.findMany({ where: { companyId, status: { in: ["draft", "ordered"] } }, include: { lines: true } }),
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

  /** Paid-invoice revenue by month over the trailing `months` window, oldest first — the
   * simplest honest trend line (no revenue-recognition smoothing, just when payment happened). */
  /** Converts each payment from its own invoice's currency (see Invoice.currency) into the
   * company's default before bucketing — a project billed in an override currency would
   * otherwise get its payments silently added as if they were company.currency. */
  async revenueTrend(companyId: string, months = 12) {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const [company, payments] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.payment.findMany({
        where: { invoice: { companyId }, paidAt: { gte: windowStart } },
        select: { amount: true, paidAt: true, invoice: { select: { currency: true } } },
      }),
    ]);

    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const p of payments) {
      const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets.has(key)) continue;
      const converted = await this.exchangeRates.convert(Number(p.amount), p.invoice.currency, company.currency);
      buckets.set(key, buckets.get(key)! + converted);
    }

    return [...buckets.entries()].map(([month, revenue]) => ({ month, revenue: round2(revenue) }));
  }

  /** Revenue in the trailing `months`-month window vs. the equal-length window immediately
   * before it — the simplest honest period-over-period comparison (same payment-timing basis
   * as revenueTrend, not a revenue-recognition estimate). */
  async periodComparison(companyId: string, months = 1) {
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 2 * months + 1, 1);

    const [currentPayments, previousPayments] = await Promise.all([
      this.prisma.payment.findMany({ where: { invoice: { companyId }, paidAt: { gte: currentStart } }, select: { amount: true } }),
      this.prisma.payment.findMany({
        where: { invoice: { companyId }, paidAt: { gte: previousStart, lt: currentStart } },
        select: { amount: true },
      }),
    ]);

    const currentRevenue = currentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const previousRevenue = previousPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const changePercent = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

    return {
      months,
      currentPeriod: { start: currentStart.toISOString(), revenue: round2(currentRevenue) },
      previousPeriod: { start: previousStart.toISOString(), revenue: round2(previousRevenue) },
      changePercent: changePercent !== null ? round2(changePercent) : null,
    };
  }

  /** Tax collected by month, based on invoiced amounts (not payment timing) — the number a
   * bookkeeper reconciles against a VAT/sales-tax return, not a cash-flow figure. */
  async taxSummaryCsv(companyId: string, months = 12): Promise<string> {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: "draft" }, createdAt: { gte: windowStart } },
      select: { number: true, createdAt: true, subtotal: true, taxAmount: true, total: true },
      orderBy: { createdAt: "asc" },
    });

    return toCsv(
      ["Invoice", "Date", "Subtotal", "Tax", "Total"],
      invoices.map((i) => [
        i.number,
        i.createdAt.toISOString().slice(0, 10),
        i.subtotal.toString(),
        i.taxAmount.toString(),
        i.total.toString(),
      ]),
    );
  }

  /** Time entries clocked in outside the project's geofence — compliance view across every
   * project at once, since GeofencePanel only ever shows one project's entries at a time.
   * withinGeofence stays null (excluded here, not a violation) when the project had no geofence
   * configured at submission time. */
  private async geofenceViolationEntries(companyId: string, from?: string, to?: string) {
    return this.prisma.timeEntry.findMany({
      where: {
        companyId,
        withinGeofence: false,
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { worker: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
  }

  async geofenceViolations(companyId: string, from?: string, to?: string) {
    const entries = await this.geofenceViolationEntries(companyId, from, to);
    return entries.map((e) => ({
      id: e.id,
      date: e.date,
      workerName: e.worker.name,
      projectName: e.project.name,
      hours: Number(e.hours),
      distanceFromSiteMeters: e.distanceFromSiteMeters,
    }));
  }

  async geofenceViolationsCsv(companyId: string, from?: string, to?: string): Promise<string> {
    const entries = await this.geofenceViolationEntries(companyId, from, to);
    return toCsv(
      ["Date", "Worker", "Project", "Hours", "Distance from site (m)"],
      entries.map((e) => [
        e.date.toISOString().slice(0, 10),
        e.worker.name,
        e.project.name,
        e.hours.toString(),
        e.distanceFromSiteMeters !== null ? String(e.distanceFromSiteMeters) : "",
      ]),
    );
  }

  /** % of the period each active piece of equipment spent checked out, from
   * EquipmentAssignment.checkedOutAt/checkedInAt overlap with [from, to] — defaults to the
   * trailing 30 days. A still-checked-out assignment counts as in-use through `to` (or now,
   * whichever is earlier), not through some assumed end date. */
  async equipmentUtilization(companyId: string, from?: string, to?: string) {
    const periodEnd = to ? new Date(to) : new Date();
    const periodStart = from ? new Date(from) : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodMs = periodEnd.getTime() - periodStart.getTime();

    const equipment = await this.prisma.equipment.findMany({
      where: { companyId, status: { not: "retired" } },
      include: {
        assignments: {
          where: { checkedOutAt: { lte: periodEnd }, OR: [{ checkedInAt: null }, { checkedInAt: { gte: periodStart } }] },
        },
      },
      orderBy: { name: "asc" },
    });

    return equipment
      .map((eq) => {
        const inUseMs = eq.assignments.reduce((sum, a) => {
          const start = Math.max(a.checkedOutAt.getTime(), periodStart.getTime());
          const end = Math.min((a.checkedInAt ?? periodEnd).getTime(), periodEnd.getTime());
          return sum + Math.max(0, end - start);
        }, 0);
        return {
          id: eq.id,
          name: eq.name,
          category: eq.category,
          status: eq.status,
          hoursInUse: round2(inUseMs / 3_600_000),
          utilizationPercent: periodMs > 0 ? round2((inUseMs / periodMs) * 100) : 0,
        };
      })
      .sort((a, b) => a.utilizationPercent - b.utilizationPercent);
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
