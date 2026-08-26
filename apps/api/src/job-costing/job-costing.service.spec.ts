import { Test } from "@nestjs/testing";
import { JobCostingService } from "./job-costing.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const PROJECT_1 = "project-1";
const CONCRETE = { id: "cc-concrete", code: "03 00 00", name: "Concrete", companyId: COMPANY_A };
const ELECTRICAL = { id: "cc-electrical", code: "26 00 00", name: "Electrical", companyId: COMPANY_A };

describe("JobCostingService.report", () => {
  let service: JobCostingService;
  let prisma: {
    estimate: { findMany: jest.Mock };
    costCode: { findMany: jest.Mock };
    estimateLine: { findMany: jest.Mock };
    changeOrderLine: { findMany: jest.Mock };
    subcontractorCost: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      estimate: { findMany: jest.fn() },
      costCode: { findMany: jest.fn() },
      estimateLine: { findMany: jest.fn() },
      changeOrderLine: { findMany: jest.fn() },
      subcontractorCost: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [JobCostingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(JobCostingService);
  });

  it("returns an empty report when the project has no approved estimate and no subcontractor costs", async () => {
    prisma.estimate.findMany.mockResolvedValue([]);
    prisma.costCode.findMany.mockResolvedValue([]);
    prisma.subcontractorCost.findMany.mockResolvedValue([]);

    const result = await service.report(COMPANY_A, PROJECT_1);

    expect(result).toEqual({ rows: [], totals: { estimated: 0, committed: 0, actual: 0, variance: 0 } });
    expect(prisma.estimateLine.findMany).not.toHaveBeenCalled();
    expect(prisma.changeOrderLine.findMany).not.toHaveBeenCalled();
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
