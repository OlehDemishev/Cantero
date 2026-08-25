import { Test } from "@nestjs/testing";
import { ReportsService } from "./reports.service";
import { PrismaService } from "../common/prisma/prisma.service";

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
    ...overrides,
  };
}

describe("ReportsService.portfolio", () => {
  let service: ReportsService;
  let prisma: { project: { findMany: jest.Mock }; taskDependency: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { project: { findMany: jest.fn() }, taskDependency: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
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
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
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
});

describe("ReportsService.revenueTrend", () => {
  let service: ReportsService;
  let prisma: { payment: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { payment: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
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
    prisma.payment.findMany.mockResolvedValue([{ amount: "250.5", paidAt: now }]);

    const result = await service.revenueTrend(COMPANY_A, 3);

    expect(result.find((r) => r.month === thisMonthKey)?.revenue).toBe(250.5);
  });

  it("sums multiple payments landing in the same month", async () => {
    const now = new Date();
    prisma.payment.findMany.mockResolvedValue([
      { amount: "100", paidAt: now },
      { amount: "50", paidAt: now },
    ]);

    const result = await service.revenueTrend(COMPANY_A, 1);

    expect(result[0].revenue).toBe(150);
  });
});
