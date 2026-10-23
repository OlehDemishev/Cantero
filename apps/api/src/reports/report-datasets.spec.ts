import { fetchDatasetRows, fieldsFor, type DatasetDeps } from "./report-datasets";

const COMPANY_A = "company-a";
const VIEWER = { userId: "user-1", role: "accountant" };

function makeDeps(overrides: Partial<DatasetDeps> = {}): DatasetDeps {
  return {
    prisma: {
      project: { findMany: jest.fn().mockResolvedValue([]) },
      customFieldDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      customFieldValue: { findMany: jest.fn().mockResolvedValue([]) },
    } as never,
    reports: {
      revenueTrend: jest.fn(),
      projectMargins: jest.fn(),
    } as never,
    laborCost: {
      report: jest.fn(),
    } as never,
    projectAccess: {
      visibleWhere: jest.fn().mockResolvedValue({}),
    } as never,
    ...overrides,
  };
}

describe("fetchDatasetRows — aggregate datasets", () => {
  it("delegates revenue_by_month to ReportsService.revenueTrend", async () => {
    const deps = makeDeps();
    (deps.reports.revenueTrend as jest.Mock).mockResolvedValue([{ month: "2026-01", revenue: 1000 }]);

    const rows = await fetchDatasetRows(deps, COMPANY_A, "revenue_by_month", {}, VIEWER);

    expect(rows).toEqual([{ month: "2026-01", revenue: 1000 }]);
    expect(deps.reports.revenueTrend).toHaveBeenCalledWith(COMPANY_A);
  });

  it("delegates project_margins to ReportsService.projectMargins", async () => {
    const deps = makeDeps();
    (deps.reports.projectMargins as jest.Mock).mockResolvedValue([{ projectName: "Riverside", margin: 500 }]);

    const rows = await fetchDatasetRows(deps, COMPANY_A, "project_margins", {}, VIEWER);

    expect(rows).toEqual([{ projectName: "Riverside", margin: 500 }]);
    expect(deps.reports.projectMargins).toHaveBeenCalledWith(COMPANY_A, VIEWER);
  });

  it("delegates labor_utilization to LaborCostService.report's byWorker breakdown", async () => {
    const deps = makeDeps();
    (deps.laborCost.report as jest.Mock).mockResolvedValue({
      byWorker: [{ workerName: "Jordan Smith", hours: 40, cost: 1200 }],
      byRole: [],
      totalHours: 40,
      totalCost: 1200,
      totalUncostedHours: 0,
    });

    const rows = await fetchDatasetRows(deps, COMPANY_A, "labor_utilization", {}, VIEWER);

    expect(rows).toEqual([{ workerName: "Jordan Smith", hours: 40, cost: 1200 }]);
  });
});

describe("fetchDatasetRows — projects with custom fields", () => {
  it("merges custom field values into each project row under custom_<id> keys", async () => {
    const deps = makeDeps();
    (deps.prisma.project.findMany as jest.Mock).mockResolvedValue([
      { id: "proj-1", name: "Riverside Reno", address: null, handoverDate: null, warrantyMonths: null, createdAt: new Date(), client: null },
    ]);
    (deps.prisma.customFieldDefinition.findMany as jest.Mock).mockResolvedValue([{ id: "field-1", name: "Permit #" }]);
    (deps.prisma.customFieldValue.findMany as jest.Mock).mockResolvedValue([{ fieldId: "field-1", entityId: "proj-1", value: "PMT-42" }]);

    const rows = await fetchDatasetRows(deps, COMPANY_A, "projects", {}, VIEWER);

    expect(rows[0]["custom_field-1"]).toBe("PMT-42");
  });
});

describe("fetchDatasetRows — restricted projects", () => {
  it("drops projects the viewer can't see from the projects dataset", async () => {
    const deps = makeDeps();
    (deps.projectAccess.visibleWhere as jest.Mock).mockResolvedValue({ id: { notIn: ["restricted-1"] } });

    await fetchDatasetRows(deps, COMPANY_A, "projects", {}, VIEWER);

    expect(deps.projectAccess.visibleWhere).toHaveBeenCalledWith(COMPANY_A, "Project", "user-1", "accountant");
    expect((deps.prisma.project.findMany as jest.Mock).mock.calls[0][0].where.AND).toContainEqual({ id: { notIn: ["restricted-1"] } });
  });
});

describe("fieldsFor", () => {
  it("returns the static field list unchanged for a non-projects dataset", async () => {
    const deps = makeDeps();
    const fields = await fieldsFor(deps.prisma as never, COMPANY_A, "invoices");
    expect(fields.map((f) => f.key)).toContain("number");
    expect(deps.prisma.customFieldDefinition.findMany).not.toHaveBeenCalled();
  });

  it("appends this company's project custom fields for the projects dataset", async () => {
    const deps = makeDeps();
    (deps.prisma.customFieldDefinition.findMany as jest.Mock).mockResolvedValue([{ id: "field-1", name: "Permit #" }]);

    const fields = await fieldsFor(deps.prisma as never, COMPANY_A, "projects");

    expect(fields.find((f) => f.key === "custom_field-1")).toEqual({ key: "custom_field-1", label: "Permit #" });
  });
});
