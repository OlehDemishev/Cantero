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
