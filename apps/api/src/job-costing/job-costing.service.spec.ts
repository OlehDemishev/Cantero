import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JobCostingService } from "./job-costing.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_1 = "project-1";
const ACTOR = { userId: "user-1", name: "PM" };
const CONCRETE = { id: "cc-concrete", code: "03 00 00", name: "Concrete", companyId: COMPANY_A };
const ELECTRICAL = { id: "cc-electrical", code: "26 00 00", name: "Electrical", companyId: COMPANY_A };

describe("JobCostingService.report", () => {
  let service: JobCostingService;
  let prisma: {
    project: { findFirst: jest.Mock };
    estimate: { findMany: jest.Mock };
    costCode: { findMany: jest.Mock };
    estimateLine: { findMany: jest.Mock };
    changeOrderLine: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
    costCodeBudgetTransfer: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      estimate: { findMany: jest.fn() },
      costCode: { findMany: jest.fn() },
      estimateLine: { findMany: jest.fn() },
      changeOrderLine: { findMany: jest.fn() },
      subcontractorCost: { findMany: jest.fn() },
      costCodeBudgetTransfer: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [JobCostingService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(JobCostingService);
  });

  it("returns an empty report when the project has no approved estimate and no subcontractor costs", async () => {
    prisma.estimate.findMany.mockResolvedValue([]);
    prisma.costCode.findMany.mockResolvedValue([]);
    prisma.subcontractorCost.findMany.mockResolvedValue([]);

    const result = await service.report(COMPANY_A, PROJECT_1);

    expect(result).toEqual({ rows: [], totals: { estimated: 0, committed: 0, actual: 0, variance: 0 }, transfers: [] });
    expect(prisma.estimateLine.findMany).not.toHaveBeenCalled();
    expect(prisma.changeOrderLine.findMany).not.toHaveBeenCalled();
  });

  it("applies a budget transfer to the estimated column of both cost codes", async () => {
    prisma.estimate.findMany.mockResolvedValue([]);
    prisma.costCode.findMany.mockResolvedValue([CONCRETE, ELECTRICAL]);
    prisma.subcontractorCost.findMany.mockResolvedValue([]);
    prisma.costCodeBudgetTransfer.findMany.mockResolvedValue([
      { id: "t-1", fromCostCodeId: CONCRETE.id, toCostCodeId: ELECTRICAL.id, amount: "1000.00", reason: "Concrete came in under", createdByName: "PM", createdAt: new Date() },
    ]);

    const result = await service.report(COMPANY_A, PROJECT_1);

    expect(result.rows.find((r) => r.code === CONCRETE.code)).toMatchObject({ estimated: -1000 });
    expect(result.rows.find((r) => r.code === ELECTRICAL.code)).toMatchObject({ estimated: 1000 });
    expect(result.transfers).toEqual([expect.objectContaining({ id: "t-1", fromCode: CONCRETE.code, toCode: ELECTRICAL.code, amount: 1000 })]);
  });

  it("rolls up estimate lines, approved change order lines, and subcontractor costs by cost code", async () => {
    prisma.estimate.findMany.mockResolvedValue([{ id: "est-1" }]);
    prisma.costCode.findMany.mockResolvedValue([CONCRETE, ELECTRICAL]);
    prisma.estimateLine.findMany.mockResolvedValue([
      { costCodeId: CONCRETE.id, lineTotal: "1000.00" },
      { costCodeId: null, lineTotal: "200.00" },
    ]);
    prisma.changeOrderLine.findMany.mockResolvedValue([{ costCodeId: CONCRETE.id, lineTotal: "300.00" }]);
    prisma.subcontractorCost.findMany.mockResolvedValue([
      { costCodeId: CONCRETE.id, amount: "500.00", paid: true },
      { costCodeId: ELECTRICAL.id, amount: "400.00", paid: false },
    ]);

    const result = await service.report(COMPANY_A, PROJECT_1);

    const concreteRow = result.rows.find((r) => r.code === CONCRETE.code)!;
    expect(concreteRow).toMatchObject({ estimated: 1300, committed: 0, actual: 500, variance: 800 });

    const electricalRow = result.rows.find((r) => r.code === ELECTRICAL.code)!;
    expect(electricalRow).toMatchObject({ estimated: 0, committed: 400, actual: 0, variance: -400 });

    const uncategorizedRow = result.rows.find((r) => r.code === "—")!;
    expect(uncategorizedRow).toMatchObject({ estimated: 200, committed: 0, actual: 0, variance: 200 });

    expect(result.totals).toEqual({ estimated: 1500, committed: 400, actual: 500, variance: 600 });
  });

  it("only pulls change order lines from internally-approved change orders", async () => {
    prisma.estimate.findMany.mockResolvedValue([{ id: "est-1" }]);
    prisma.costCode.findMany.mockResolvedValue([]);
    prisma.estimateLine.findMany.mockResolvedValue([]);
    prisma.changeOrderLine.findMany.mockResolvedValue([]);
    prisma.subcontractorCost.findMany.mockResolvedValue([]);

    await service.report(COMPANY_A, PROJECT_1);

    expect(prisma.changeOrderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { changeOrder: { estimateId: { in: ["est-1"] }, status: "approved" } } }),
    );
  });
});

describe("JobCostingService.forecastReport", () => {
  let service: JobCostingService;
  let prisma: {
    project: { findFirst: jest.Mock };
    estimate: { findMany: jest.Mock };
    costCode: { findMany: jest.Mock };
    estimateLine: { findMany: jest.Mock };
    changeOrderLine: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
    costCodeBudgetTransfer: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      estimate: { findMany: jest.fn().mockResolvedValue([]) },
      costCode: { findMany: jest.fn().mockResolvedValue([CONCRETE]) },
      estimateLine: { findMany: jest.fn() },
      changeOrderLine: { findMany: jest.fn() },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([{ costCodeId: CONCRETE.id, amount: "6000.00", paid: true }]) },
      costCodeBudgetTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [JobCostingService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(JobCostingService);
  });

  it("rejects a project that does not belong to this company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.forecastReport(COMPANY_A, "project-x")).rejects.toThrow(NotFoundException);
  });

  it("derives percentComplete from the furthest invoice draw and augments every row and the totals with an EAC forecast", async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: PROJECT_1,
      invoices: [{ percentComplete: "30.00" }, { percentComplete: "50.00" }, { percentComplete: null }],
    });
    prisma.estimate.findMany.mockResolvedValue([{ id: "est-1" }]);
    prisma.estimateLine.findMany.mockResolvedValue([{ costCodeId: CONCRETE.id, lineTotal: "10000.00" }]);
    prisma.changeOrderLine.findMany.mockResolvedValue([]);

    const result = await service.forecastReport(COMPANY_A, PROJECT_1);

    expect(result.percentComplete).toBe(50);
    const concreteRow = result.rows.find((r) => r.code === CONCRETE.code)!;
    expect(concreteRow).toMatchObject({ estimated: 10000, actual: 6000, earnedValue: 5000 });
    expect(concreteRow.estimateAtCompletion).toBeGreaterThan(10000);
    expect(result.totals).toMatchObject({ estimated: 10000, actual: 6000, earnedValue: 5000 });
  });

  it("reports 0% complete when the project has no invoices yet", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_1, invoices: [] });
    prisma.estimateLine.findMany.mockResolvedValue([]);
    prisma.changeOrderLine.findMany.mockResolvedValue([]);
    prisma.subcontractorCost.findMany.mockResolvedValue([]);

    const result = await service.forecastReport(COMPANY_A, PROJECT_1);
    expect(result.percentComplete).toBe(0);
  });
});

describe("JobCostingService.addBudgetTransfer", () => {
  let service: JobCostingService;
  let prisma: {
    project: { findFirst: jest.Mock };
    estimate: { findMany: jest.Mock };
    costCode: { findMany: jest.Mock };
    estimateLine: { findMany: jest.Mock };
    changeOrderLine: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
    costCodeBudgetTransfer: { findMany: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: PROJECT_1, name: "Tower" }) },
      estimate: { findMany: jest.fn().mockResolvedValue([{ id: "est-1" }]) },
      costCode: { findMany: jest.fn().mockResolvedValue([CONCRETE, ELECTRICAL]) },
      estimateLine: { findMany: jest.fn().mockResolvedValue([{ costCodeId: CONCRETE.id, lineTotal: "10000.00" }]) },
      changeOrderLine: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorCost: { findMany: jest.fn().mockResolvedValue([{ costCodeId: CONCRETE.id, amount: "4000.00", paid: true }]) },
      costCodeBudgetTransfer: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [JobCostingService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(JobCostingService);
  });

  it("rejects a project that doesn't belong to this company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      service.addBudgetTransfer(COMPANY_A, ACTOR, { projectId: "project-x", fromCostCodeId: CONCRETE.id, toCostCodeId: ELECTRICAL.id, amount: 100, reason: "test" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects transferring a cost code to itself", async () => {
    await expect(
      service.addBudgetTransfer(COMPANY_A, ACTOR, { projectId: PROJECT_1, fromCostCodeId: CONCRETE.id, toCostCodeId: CONCRETE.id, amount: 100, reason: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a transfer exceeding the source cost code's remaining budget", async () => {
    // Concrete: estimated 10000, actual 4000 -> remaining 6000
    await expect(
      service.addBudgetTransfer(COMPANY_A, ACTOR, { projectId: PROJECT_1, fromCostCodeId: CONCRETE.id, toCostCodeId: ELECTRICAL.id, amount: 6001, reason: "test" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates the transfer and records an audit entry when within the remaining budget", async () => {
    prisma.costCodeBudgetTransfer.create.mockResolvedValue({ id: "t-1" });

    const result = await service.addBudgetTransfer(COMPANY_A, ACTOR, {
      projectId: PROJECT_1,
      fromCostCodeId: CONCRETE.id,
      toCostCodeId: ELECTRICAL.id,
      amount: 6000,
      reason: "Concrete came in under",
    });

    expect(result.id).toBe("t-1");
    expect(prisma.costCodeBudgetTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromCostCodeId: CONCRETE.id, toCostCodeId: ELECTRICAL.id, amount: 6000 }) }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});
