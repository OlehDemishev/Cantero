import { Test } from "@nestjs/testing";
import { ReportsService } from "./reports.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

const PDF_PROVIDERS = [
  { provide: PdfService, useValue: { render: jest.fn() } },
  { provide: StorageService, useValue: { read: jest.fn() } },
  // Identity conversion — matches the real service's own graceful-degrade for a missing rate,
  // and keeps every existing single-currency fixture's numbers unchanged.
  { provide: ExchangeRateService, useValue: { convert: jest.fn((amount: number) => Promise.resolve(amount)) } },
];

const COMPANY_A = "company-a";

function baseProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "project-1",
    name: "Site A",
    client: { name: "Acme Co" },
    estimates: [],
    stockMovements: [],
    timeEntries: [],
    subcontractorCosts: [],
    tasks: [],
    rfis: [],
    punchListItems: [],
    submittals: [],
    incidentReports: [],
    invoices: [],
    drawRequests: [],
    ...overrides,
  };
}

describe("ReportsService.portfolio", () => {
  let service: ReportsService;
  let prisma: {
    project: { findMany: jest.Mock };
    taskDependency: { findMany: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findMany: jest.fn() },
      taskDependency: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "EUR" }) },
    };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("flags a project at risk only when an incomplete critical-path task is overdue", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    prisma.project.findMany.mockResolvedValue([
      baseProject({
        id: "project-at-risk",
        // A single dated task with no dependencies is trivially "critical" (it's on its own
        // only chain) — overdue and not done, so this project should be flagged.
        tasks: [{ id: "task-1", startDate: yesterday, dueDate: yesterday, status: "planned" }],
      }),
      baseProject({
        id: "project-on-track",
        tasks: [{ id: "task-2", startDate: nextWeek, dueDate: nextWeek, status: "planned" }],
      }),
    ]);

    const result = await service.portfolio(COMPANY_A);
    const byId = Object.fromEntries(result.projects.map((p) => [p.id, p]));

    expect(byId["project-at-risk"].atRisk).toBe(true);
    expect(byId["project-on-track"].atRisk).toBe(false);
    expect(result.summary.projectsAtRisk).toBe(1);
    expect(result.summary.projectsTotal).toBe(2);
  });

  it("counts pending submittals only from the latest revision per chain", async () => {
    prisma.project.findMany.mockResolvedValue([
      baseProject({
        submittals: [
          // rev 0 was rejected, but rev 1 (the latest in the chain) was approved — the chain
          // as a whole should NOT count as pending.
          { id: "sub-1-rev0", rootSubmittalId: null, revision: 0, status: "rejected" },
          { id: "sub-1-rev1", rootSubmittalId: "sub-1-rev0", revision: 1, status: "approved" },
          // A standalone submittal still awaiting review.
          { id: "sub-2", rootSubmittalId: null, revision: 0, status: "submitted" },
        ],
      }),
    ]);

    const result = await service.portfolio(COMPANY_A);

    expect(result.projects[0].pendingSubmittalCount).toBe(1);
  });

  it("uses real dependency edges for the critical-path calc, not just per-task isolation", async () => {
    // Two dated tasks where B has slack against A alone, but a real FS dependency makes A
    // critical too (delaying A delays B, which ends later than A). Without wiring the actual
    // TaskDependency edges into the CPM call this regresses to "every task is its own chain",
    // which would wrongly report A as non-critical.
    const start = new Date("2026-09-01T00:00:00.000Z");
    const aEnd = new Date("2026-09-03T00:00:00.000Z");
    const bStart = new Date("2026-09-03T00:00:00.000Z");
    const bEnd = new Date("2026-09-06T00:00:00.000Z");

    prisma.project.findMany.mockResolvedValue([
      baseProject({
        id: "project-1",
        tasks: [
          { id: "task-a", startDate: start, dueDate: aEnd, status: "planned" },
          { id: "task-b", startDate: bStart, dueDate: bEnd, status: "planned" },
        ],
      }),
    ]);
    prisma.taskDependency.findMany.mockResolvedValue([
      {
        predecessorId: "task-a",
        successorId: "task-b",
        type: "finish_to_start",
        lagDays: 0,
        predecessor: { projectId: "project-1" },
      },
    ]);

    const result = await service.portfolio(COMPANY_A);

    expect(result.projects[0].criticalTaskCount).toBe(2);
  });

  it("sums per-project counts into the company-wide summary", async () => {
    prisma.project.findMany.mockResolvedValue([
      baseProject({ id: "p1", rfis: [{ status: "open" }, { status: "closed" }] }),
      baseProject({ id: "p2", rfis: [{ status: "open" }] }),
    ]);

    const result = await service.portfolio(COMPANY_A);

    expect(result.summary.openRfiTotal).toBe(2);
  });

  it("only counts a draw's invoice toward fundedToDate once its draw request is marked funded", async () => {
    prisma.project.findMany.mockResolvedValue([
      baseProject({
        invoices: [
          { id: "inv-1", total: 1000, status: "sent" },
          { id: "inv-2", total: 500, status: "sent" },
        ],
        drawRequests: [
          { invoiceId: "inv-1", status: "funded" },
          { invoiceId: "inv-2", status: "submitted" },
        ],
      }),
    ]);

    const result = await service.portfolio(COMPANY_A);

    expect(result.projects[0].billedToDate).toBe(1500);
    expect(result.projects[0].fundedToDate).toBe(1000);
    expect(result.projects[0].openDrawCount).toBe(1);
    expect(result.summary.fundedToDateTotal).toBe(1000);
  });

  it("converts a project's totals from its own currency into the company's before rolling up the summary", async () => {
    prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
    prisma.project.findMany.mockResolvedValue([
      baseProject({ id: "project-usd", currency: "USD", estimates: [{ grandTotal: "100" }] }),
    ]);
    const exchangeRates = { convert: jest.fn().mockResolvedValue(92) };
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        ...PDF_PROVIDERS.filter((p) => p.provide !== ExchangeRateService),
        { provide: ExchangeRateService, useValue: exchangeRates },
      ],
    }).compile();
    service = module.get(ReportsService);

    const result = await service.portfolio(COMPANY_A);

    expect(exchangeRates.convert).toHaveBeenCalledWith(100, "USD", "EUR");
    expect(result.projects[0].budgetTotal).toBe(92);
    expect(result.summary.budgetTotal).toBe(92);
    expect(result.currency).toBe("EUR");
  });
});

function daysFromNowUTC(days: number): Date {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("ReportsService.cashFlowForecast", () => {
  let service: ReportsService;
  let prisma: {
    invoice: { findMany: jest.Mock };
    recurringInvoice: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
    purchaseOrder: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      recurringInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("buckets an outstanding invoice's remaining balance into the week containing its due date", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", total: 1000, dueDate: daysFromNowUTC(10), payments: [{ amount: 400 }] },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.weeks[1].inflowBreakdown.invoices).toBe(600);
    expect(result.weeks[0].inflowBreakdown.invoices).toBe(0);
  });

  it("collapses an overdue invoice into the current week instead of dropping it", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", total: 500, dueDate: daysFromNowUTC(-15), payments: [] },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.weeks[0].inflowBreakdown.invoices).toBe(500);
  });

  it("excludes an invoice with no due date from the weekly buckets but reports it as unscheduled", async () => {
    prisma.invoice.findMany.mockResolvedValue([{ id: "inv-1", total: 750, dueDate: null, payments: [] }]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.unscheduledInflow).toBe(750);
    expect(result.weeks.every((w) => w.inflowBreakdown.invoices === 0)).toBe(true);
  });

  it("ignores a fully paid invoice", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", total: 500, dueDate: daysFromNowUTC(5), payments: [{ amount: 500 }] },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.totals.inflow).toBe(0);
  });

  it("projects a recurring invoice's upcoming occurrences valued from its lines and tax", async () => {
    prisma.recurringInvoice.findMany.mockResolvedValue([
      {
        id: "rec-1",
        frequency: "weekly",
        taxPercent: 10,
        nextRunDate: daysFromNowUTC(2),
        endDate: null,
        lines: [{ description: "Maintenance", quantity: 1, unitPrice: 100 }],
      },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    // 100 + 10% tax = 110, occurring at day 2 (week 0) and day 9 (week 1) within the 13-week window.
    expect(result.weeks[0].inflowBreakdown.recurring).toBe(110);
    expect(result.weeks[1].inflowBreakdown.recurring).toBe(110);
  });

  it("collapses an overdue recurring nextRunDate into the current week without replaying missed cycles", async () => {
    prisma.recurringInvoice.findMany.mockResolvedValue([
      {
        id: "rec-1",
        frequency: "weekly",
        taxPercent: 0,
        nextRunDate: daysFromNowUTC(-90), // ~13 missed weekly cycles
        endDate: null,
        lines: [{ description: "Maintenance", quantity: 1, unitPrice: 100 }],
      },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    // Exactly one occurrence in week 0 — not 13 stacked copies of the missed cycles.
    expect(result.weeks[0].inflowBreakdown.recurring).toBe(100);
  });

  it("buckets an unpaid subcontractor cost by its due date", async () => {
    prisma.subcontractorCost.findMany.mockResolvedValue([{ id: "cost-1", amount: 2000, dueDate: daysFromNowUTC(20) }]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.weeks[2].outflowBreakdown.subcontractors).toBe(2000);
  });

  it("values a pending purchase order as the sum of quantity times unit price across its lines", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        id: "po-1",
        expectedDate: daysFromNowUTC(4),
        lines: [
          { quantity: 10, unitPrice: 5 },
          { quantity: 2, unitPrice: 25 },
        ],
      },
    ]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.weeks[0].outflowBreakdown.purchaseOrders).toBe(100);
  });

  it("computes a running cumulative net across weeks", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", total: 1000, dueDate: daysFromNowUTC(1), payments: [] },
    ]);
    prisma.subcontractorCost.findMany.mockResolvedValue([{ id: "cost-1", amount: 300, dueDate: daysFromNowUTC(1) }]);

    const result = await service.cashFlowForecast(COMPANY_A);

    expect(result.weeks[0].net).toBe(700);
    expect(result.weeks[0].cumulativeNet).toBe(700);
    expect(result.weeks[1].cumulativeNet).toBe(700);
  });

  it("scopes invoices/subcontractor costs to one project and skips purchase orders entirely when a projectId is given", async () => {
    await service.cashFlowForecast(COMPANY_A, "project-1");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "project-1" }) }),
    );
    expect(prisma.subcontractorCost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "project-1" }) }),
    );
    expect(prisma.purchaseOrder.findMany).not.toHaveBeenCalled();
  });
});

describe("ReportsService.revenueTrend", () => {
  let service: ReportsService;
  let prisma: { payment: { findMany: jest.Mock }; company: { findUniqueOrThrow: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "EUR" }) },
    };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("returns one bucket per month over the trailing window, oldest first", async () => {
    const result = await service.revenueTrend(COMPANY_A, 3);
    expect(result).toHaveLength(3);
    // Strictly increasing year-month keys, oldest to newest.
    const keys = result.map((r) => r.month);
    expect(keys).toEqual([...keys].sort());
  });

  it("buckets a payment into the month it was actually paid", async () => {
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    prisma.payment.findMany.mockResolvedValue([{ amount: "250.5", paidAt: now, invoice: { currency: "EUR" } }]);

    const result = await service.revenueTrend(COMPANY_A, 3);

    expect(result.find((r) => r.month === thisMonthKey)?.revenue).toBe(250.5);
  });

  it("sums multiple payments landing in the same month", async () => {
    const now = new Date();
    prisma.payment.findMany.mockResolvedValue([
      { amount: "100", paidAt: now, invoice: { currency: "EUR" } },
      { amount: "50", paidAt: now, invoice: { currency: "EUR" } },
    ]);

    const result = await service.revenueTrend(COMPANY_A, 1);

    expect(result[0].revenue).toBe(150);
  });

  it("converts a payment from its own invoice's currency into the company's default before summing", async () => {
    const now = new Date();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
    prisma.payment.findMany.mockResolvedValue([{ amount: "100", paidAt: now, invoice: { currency: "USD" } }]);
    const exchangeRates = { convert: jest.fn().mockResolvedValue(92) };
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        ...PDF_PROVIDERS.filter((p) => p.provide !== ExchangeRateService),
        { provide: ExchangeRateService, useValue: exchangeRates },
      ],
    }).compile();
    service = module.get(ReportsService);

    const result = await service.revenueTrend(COMPANY_A, 1);

    expect(exchangeRates.convert).toHaveBeenCalledWith(100, "USD", "EUR");
    expect(result[0].revenue).toBe(92);
  });
});

describe("ReportsService.periodComparison", () => {
  let service: ReportsService;
  let prisma: { payment: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { payment: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("computes a positive percent change when the current period out-earns the previous one", async () => {
    const now = new Date();
    prisma.payment.findMany.mockImplementation(({ where }) => {
      // The service issues two findMany calls in parallel — the one with an upper bound (`lt`)
      // is the previous period, the one without is the current period.
      if (where.paidAt.lt) return Promise.resolve([{ amount: "100" }]);
      return Promise.resolve([{ amount: "150" }]);
    });

    const result = await service.periodComparison(COMPANY_A, 1);

    expect(result.currentPeriod.revenue).toBe(150);
    expect(result.previousPeriod.revenue).toBe(100);
    expect(result.changePercent).toBe(50);
  });

  it("returns a null percent change when the previous period had zero revenue", async () => {
    prisma.payment.findMany.mockImplementation(({ where }) => {
      if (where.paidAt.lt) return Promise.resolve([]);
      return Promise.resolve([{ amount: "100" }]);
    });

    const result = await service.periodComparison(COMPANY_A, 1);

    expect(result.changePercent).toBeNull();
  });
});

describe("ReportsService.wipReport", () => {
  let service: ReportsService;
  let prisma: { project: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { project: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("flags a project as overbilled when billed-to-date exceeds earned revenue", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Overbilled Project",
        estimates: [{ grandTotal: "10000", materialsCostTotal: "3000", laborCostTotal: "2000" }],
        // 25% of the 5000 budgeted cost incurred so far → 25% complete → earned = 2500.
        stockMovements: [{ quantity: "1", materialCatalogItem: { defaultUnitPrice: "1250" } }],
        timeEntries: [],
        subcontractorCosts: [],
        // Billed 4000, well above the 2500 earned.
        invoices: [{ total: "4000", percentComplete: null }],
      },
    ]);

    const result = await service.wipReport(COMPANY_A);

    expect(result.rows[0].status).toBe("overbilled");
    expect(result.rows[0].billedToDate).toBe(4000);
    expect(result.rows[0].overUnderBilling).toBeGreaterThan(0);
  });

  it("flags a project as underbilled when billed-to-date is behind earned revenue", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Underbilled Project",
        estimates: [{ grandTotal: "10000", materialsCostTotal: "3000", laborCostTotal: "2000" }],
        stockMovements: [{ quantity: "1", materialCatalogItem: { defaultUnitPrice: "2500" } }], // 50% of budget incurred
        timeEntries: [],
        subcontractorCosts: [],
        invoices: [{ total: "1000", percentComplete: null }], // billed far less than earned
      },
    ]);

    const result = await service.wipReport(COMPANY_A);

    expect(result.rows[0].status).toBe("underbilled");
    expect(result.rows[0].overUnderBilling).toBeLessThan(0);
  });

  it("sums per-project figures into company-wide totals", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Project One",
        estimates: [{ grandTotal: "10000", materialsCostTotal: "5000", laborCostTotal: "0" }],
        stockMovements: [],
        timeEntries: [],
        subcontractorCosts: [],
        invoices: [{ total: "1000", percentComplete: null }],
      },
      {
        id: "p2",
        name: "Project Two",
        estimates: [{ grandTotal: "20000", materialsCostTotal: "8000", laborCostTotal: "0" }],
        stockMovements: [],
        timeEntries: [],
        subcontractorCosts: [],
        invoices: [{ total: "2000", percentComplete: null }],
      },
    ]);

    const result = await service.wipReport(COMPANY_A);

    expect(result.totals.contractValue).toBe(30000);
    expect(result.totals.billedToDate).toBe(3000);
  });

  it("only includes projects with at least one approved estimate", async () => {
    prisma.project.findMany.mockResolvedValue([]);

    await service.wipReport(COMPANY_A);

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY_A, estimates: { some: { status: "approved" } } } }),
    );
  });
});

describe("ReportsService.backlog", () => {
  let service: ReportsService;
  let prisma: { project: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { project: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("is approved contract value minus what's already been billed", async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Backlog Project",
        estimates: [{ grandTotal: "30000", materialsCostTotal: "10000", laborCostTotal: "5000" }],
        stockMovements: [],
        timeEntries: [],
        subcontractorCosts: [],
        invoices: [{ total: "12000", percentComplete: null }],
      },
    ]);

    const result = await service.backlog(COMPANY_A);

    expect(result.contractValue).toBe(30000);
    expect(result.billedToDate).toBe(12000);
    expect(result.backlog).toBe(18000);
  });
});

describe("ReportsService.complianceCalendar", () => {
  let service: ReportsService;
  let prisma: {
    subcontractorDocument: { findMany: jest.Mock };
    supplierDocument: { findMany: jest.Mock };
    workerCertification: { findMany: jest.Mock };
    permit: { findMany: jest.Mock };
    companyDocument: { findMany: jest.Mock };
    vehicle: { findMany: jest.Mock };
    worker: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      subcontractorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      supplierDocument: { findMany: jest.fn().mockResolvedValue([]) },
      workerCertification: { findMany: jest.fn().mockResolvedValue([]) },
      permit: { findMany: jest.fn().mockResolvedValue([]) },
      companyDocument: { findMany: jest.fn().mockResolvedValue([]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      worker: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("merges all five expiry sources into one list sorted soonest-first", async () => {
    prisma.subcontractorDocument.findMany.mockResolvedValue([
      { id: "d1", type: "general_liability_insurance", name: "GL", expiresAt: daysFromNowUTC(20), subcontractor: { name: "Acme Sub" } },
    ]);
    prisma.supplierDocument.findMany.mockResolvedValue([
      { id: "d2", type: "general_liability_insurance", name: "GL", expiresAt: daysFromNowUTC(5), supplier: { name: "Acme Supply" } },
    ]);
    prisma.workerCertification.findMany.mockResolvedValue([
      { id: "d3", name: "OSHA 30", expiresAt: daysFromNowUTC(10), worker: { name: "Marcus Bell" } },
    ]);
    prisma.permit.findMany.mockResolvedValue([
      { id: "d4", permitType: "Building permit", expiresAt: daysFromNowUTC(15), project: { name: "Site A" } },
    ]);
    prisma.companyDocument.findMany.mockResolvedValue([
      { id: "d5", type: "workers_comp_insurance", name: "WC Policy", expiresAt: daysFromNowUTC(1) },
    ]);

    const result = await service.complianceCalendar(COMPANY_A);

    expect(result.items).toHaveLength(5);
    expect(result.items.map((i) => i.type)).toEqual([
      "company_document",
      "supplier_document",
      "worker_certification",
      "permit",
      "subcontractor_document",
    ]);
  });

  it("splits items into expired vs. expiring-soon counts", async () => {
    prisma.subcontractorDocument.findMany.mockResolvedValue([
      { id: "d1", type: "general_liability_insurance", name: "GL", expiresAt: daysFromNowUTC(-5), subcontractor: { name: "Acme Sub" } },
      { id: "d2", type: "workers_comp_insurance", name: "WC", expiresAt: daysFromNowUTC(5), subcontractor: { name: "Acme Sub" } },
    ]);

    const result = await service.complianceCalendar(COMPANY_A);

    expect(result.expiredCount).toBe(1);
    expect(result.expiringCount).toBe(1);
    expect(result.items[0].status).toBe("expired");
    expect(result.items[1].status).toBe("expiring");
  });

  it("excludes a permit with no expiresAt set", async () => {
    prisma.permit.findMany.mockResolvedValue([
      { id: "d1", permitType: "Building permit", expiresAt: null, project: { name: "Site A" } },
    ]);

    const result = await service.complianceCalendar(COMPANY_A);

    expect(result.items).toHaveLength(0);
  });

  it("respects a custom lookahead window", async () => {
    await service.complianceCalendar(COMPANY_A, 30);

    const call = prisma.subcontractorDocument.findMany.mock.calls[0][0];
    const cutoff = call.where.expiresAt.lte as Date;
    const expectedCutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });
});

describe("ReportsService.geofenceViolations", () => {
  let service: ReportsService;
  let prisma: { timeEntry: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { timeEntry: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("only queries entries flagged withinGeofence: false", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);

    await service.geofenceViolations(COMPANY_A);

    const call = prisma.timeEntry.findMany.mock.calls[0][0];
    expect(call.where.withinGeofence).toBe(false);
    expect(call.where.date).toBeUndefined();
  });

  it("maps worker/project names and distance onto each violation", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([
      {
        id: "te-1",
        date: new Date("2026-03-01"),
        hours: "8.00",
        distanceFromSiteMeters: 340,
        worker: { name: "Ivan" },
        project: { name: "Site A" },
      },
    ]);

    const result = await service.geofenceViolations(COMPANY_A);

    expect(result).toEqual([
      { id: "te-1", date: new Date("2026-03-01"), workerName: "Ivan", projectName: "Site A", hours: 8, distanceFromSiteMeters: 340 },
    ]);
  });

  it("scopes the date range when from/to are given", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);

    await service.geofenceViolations(COMPANY_A, "2026-01-01", "2026-01-31");

    const call = prisma.timeEntry.findMany.mock.calls[0][0];
    expect(call.where.date.gte).toEqual(new Date("2026-01-01"));
    expect(call.where.date.lte).toEqual(new Date("2026-01-31"));
  });

  it("renders a CSV row per violation", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([
      {
        id: "te-1",
        date: new Date("2026-03-01"),
        hours: "8.00",
        distanceFromSiteMeters: 340,
        worker: { name: "Ivan" },
        project: { name: "Site A" },
      },
    ]);

    const csv = await service.geofenceViolationsCsv(COMPANY_A);

    expect(csv).toContain("Ivan");
    expect(csv).toContain("Site A");
    expect(csv).toContain("340");
  });
});

describe("ReportsService.equipmentUtilization", () => {
  let service: ReportsService;
  let prisma: { equipment: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { equipment: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("computes 100% utilization for a piece of equipment checked out for the whole period", async () => {
    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-01-11T00:00:00.000Z"; // 10 days
    prisma.equipment.findMany.mockResolvedValue([
      {
        id: "eq-1",
        name: "Excavator",
        category: "heavy",
        status: "in_use",
        assignments: [{ checkedOutAt: new Date(from), checkedInAt: new Date(to) }],
      },
    ]);

    const result = await service.equipmentUtilization("company-a", from, to);

    expect(result[0].utilizationPercent).toBe(100);
    expect(result[0].hoursInUse).toBe(240);
  });

  it("computes 0% for equipment with no assignments in the period", async () => {
    prisma.equipment.findMany.mockResolvedValue([
      { id: "eq-1", name: "Idle crane", category: "heavy", status: "available", assignments: [] },
    ]);

    const result = await service.equipmentUtilization("company-a", "2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z");

    expect(result[0].utilizationPercent).toBe(0);
  });

  it("clips an assignment that started before the period to the period start", async () => {
    prisma.equipment.findMany.mockResolvedValue([
      {
        id: "eq-1",
        name: "Loader",
        category: "heavy",
        status: "in_use",
        assignments: [{ checkedOutAt: new Date("2025-12-25T00:00:00.000Z"), checkedInAt: new Date("2026-01-06T00:00:00.000Z") }],
      },
    ]);

    // 10-day period, assignment overlaps the first 5 days of it → 50%
    const result = await service.equipmentUtilization("company-a", "2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z");

    expect(result[0].utilizationPercent).toBe(50);
  });

  it("treats a still-checked-out assignment (checkedInAt null) as in-use through the period end", async () => {
    prisma.equipment.findMany.mockResolvedValue([
      {
        id: "eq-1",
        name: "Generator",
        category: "power",
        status: "in_use",
        assignments: [{ checkedOutAt: new Date("2026-01-06T00:00:00.000Z"), checkedInAt: null }],
      },
    ]);

    const result = await service.equipmentUtilization("company-a", "2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z");

    expect(result[0].utilizationPercent).toBe(50);
  });

  it("sorts by utilization ascending so the most idle equipment surfaces first", async () => {
    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-01-11T00:00:00.000Z";
    prisma.equipment.findMany.mockResolvedValue([
      { id: "busy", name: "Busy", category: "heavy", status: "in_use", assignments: [{ checkedOutAt: new Date(from), checkedInAt: new Date(to) }] },
      { id: "idle", name: "Idle", category: "heavy", status: "available", assignments: [] },
    ]);

    const result = await service.equipmentUtilization("company-a", from, to);

    expect(result.map((r) => r.id)).toEqual(["idle", "busy"]);
  });
});

describe("ReportsService.winRateReport", () => {
  let service: ReportsService;
  let prisma: { estimate: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { estimate: { findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }, ...PDF_PROVIDERS],
    }).compile();

    service = module.get(ReportsService);
  });

  it("only queries non-template, non-variant, sent estimates", async () => {
    prisma.estimate.findMany.mockResolvedValue([]);

    await service.winRateReport(COMPANY_A);

    expect(prisma.estimate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY_A, isTemplate: false, variantOfId: null, sentAt: { not: null } } }),
    );
  });

  it("groups decisions by send month and by margin band", async () => {
    prisma.estimate.findMany.mockResolvedValue([
      {
        clientDecision: "approved",
        grandTotal: "10000",
        markupPercent: "15",
        sentAt: new Date("2026-08-01T00:00:00Z"),
        decisionAt: new Date("2026-08-05T00:00:00Z"),
      },
      {
        clientDecision: "rejected",
        grandTotal: "5000",
        markupPercent: "25",
        sentAt: new Date("2026-09-01T00:00:00Z"),
        decisionAt: new Date("2026-09-03T00:00:00Z"),
      },
    ]);

    const result = await service.winRateReport(COMPANY_A);

    expect(result.overall.decidedCount).toBe(2);
    expect(result.overall.wonCount).toBe(1);
    expect(result.byMonth.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(result.byMarginBand.map((b) => b.band)).toEqual(["10-20%", "20%+"]);
  });
});
