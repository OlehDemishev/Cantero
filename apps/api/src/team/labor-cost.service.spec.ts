import { Test } from "@nestjs/testing";
import { LaborCostService } from "./labor-cost.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const MON = new Date("2026-08-31T08:00:00.000Z");

describe("LaborCostService — ADP/Gusto payroll export", () => {
  let service: LaborCostService;
  let prisma: {
    timeEntry: { findMany: jest.Mock };
    worker: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      timeEntry: { findMany: jest.fn() },
      worker: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [LaborCostService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LaborCostService);
  });

  it("ADP export uses the worker's payrollEmployeeId as the identifier when set", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "w1", hours: "45", date: MON, hourlyCostSnapshot: null }]);
    prisma.worker.findMany.mockResolvedValue([
      { id: "w1", name: "Jane Doe", payrollEmployeeId: "EMP-42", hourlyCost: "35.00" },
    ]);

    const csv = await service.payrollExportAdpCsv(COMPANY_A, { from: "2026-08-24", to: "2026-09-06" });

    expect(csv).toContain("EMP-42");
    expect(csv).toContain("Jane Doe");
    expect(csv).toContain("40"); // regular hours
    expect(csv).toContain("5"); // overtime hours
    expect(csv).toContain("35.00");
  });

  it("ADP export falls back to the worker's name as the identifier when payrollEmployeeId is unset", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "w1", hours: "10", date: MON, hourlyCostSnapshot: null }]);
    prisma.worker.findMany.mockResolvedValue([{ id: "w1", name: "Jane Doe", payrollEmployeeId: null, hourlyCost: null }]);

    const csv = await service.payrollExportAdpCsv(COMPANY_A, {});
    const rows = csv.trim().split("\n");

    expect(rows[1].startsWith('"Jane Doe","Jane Doe"') || rows[1].startsWith("Jane Doe,Jane Doe")).toBe(true);
  });

  it("ADP export falls back to the entry's hourlyCostSnapshot when the worker's live rate is null", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "w1", hours: "8", date: MON, hourlyCostSnapshot: "28.50" }]);
    prisma.worker.findMany.mockResolvedValue([{ id: "w1", name: "Jane Doe", payrollEmployeeId: null, hourlyCost: null }]);

    const csv = await service.payrollExportAdpCsv(COMPANY_A, {});

    expect(csv).toContain("28.50");
  });

  it("ADP export prefers the entry's hourlyCostSnapshot over the worker's current live rate, so a raise after the fact doesn't rewrite a past pay period's export", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "w1", hours: "8", date: MON, hourlyCostSnapshot: "28.50" }]);
    prisma.worker.findMany.mockResolvedValue([{ id: "w1", name: "Jane Doe", payrollEmployeeId: null, hourlyCost: "40.00" }]);

    const csv = await service.payrollExportAdpCsv(COMPANY_A, {});

    expect(csv).toContain("28.50");
    expect(csv).not.toContain("40.00");
  });

  it("Gusto export splits the worker's name into first/last on the first space", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "w1", hours: "8", date: MON, hourlyCostSnapshot: null }]);
    prisma.worker.findMany.mockResolvedValue([
      { id: "w1", name: "Jane Van Doe", payrollEmployeeId: null, hourlyCost: "35" },
    ]);

    const csv = await service.payrollExportGustoCsv(COMPANY_A, {});
    const rows = csv.trim().split("\n");
    const dataRow = rows[1];

    expect(dataRow).toContain("Jane");
    expect(dataRow).toContain("Van Doe");
  });

  it("excludes a worker whose logged hours belong to no known Worker record in this company", async () => {
    prisma.timeEntry.findMany.mockResolvedValue([{ workerId: "ghost", hours: "8", date: MON, hourlyCostSnapshot: null }]);
    prisma.worker.findMany.mockResolvedValue([]);

    const csv = await service.payrollExportAdpCsv(COMPANY_A, {});
    const rows = csv.trim().split("\n");

    expect(rows).toHaveLength(1); // header only
  });
});
