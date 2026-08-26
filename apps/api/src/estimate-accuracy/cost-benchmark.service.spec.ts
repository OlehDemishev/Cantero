import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CostBenchmarkService } from "./cost-benchmark.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("CostBenchmarkService", () => {
  let service: CostBenchmarkService;
  let prisma: {
    costCode: { findMany: jest.Mock };
    estimate: { findFirst: jest.Mock };
    estimateLine: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      costCode: { findMany: jest.fn() },
      estimate: { findFirst: jest.fn() },
      estimateLine: { findMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [CostBenchmarkService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CostBenchmarkService);
  });

  describe("costCodeBenchmarks()", () => {
    it("computes median/average/min/max unit price across a cost code's estimate line history", async () => {
      prisma.costCode.findMany.mockResolvedValue([
        {
          id: "cc-1",
          code: "03300",
          name: "Concrete",
          estimateLines: [
            { lineTotal: 100, quantity: 10 }, // 10/unit
            { lineTotal: 300, quantity: 10 }, // 30/unit
            { lineTotal: 200, quantity: 10 }, // 20/unit
          ],
        },
      ]);

      const result = await service.costCodeBenchmarks(COMPANY_A);

      expect(result[0]).toMatchObject({
        costCodeId: "cc-1",
        sampleSize: 3,
        medianUnitPrice: 20,
        averageUnitPrice: 20,
        minUnitPrice: 10,
        maxUnitPrice: 30,
      });
    });

    it("omits a cost code with no estimate line history", async () => {
      prisma.costCode.findMany.mockResolvedValue([{ id: "cc-1", code: "03300", name: "Concrete", estimateLines: [] }]);

      const result = await service.costCodeBenchmarks(COMPANY_A);

      expect(result).toEqual([]);
    });
  });

  describe("benchmarkForEstimate()", () => {
    it("rejects an estimate that does not belong to this company", async () => {
      prisma.estimate.findFirst.mockResolvedValue(null);

      await expect(service.benchmarkForEstimate(COMPANY_A, "estimate-1")).rejects.toThrow(NotFoundException);
    });

    it("flags a line priced well above the historical median for its cost code", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "estimate-1" });
      prisma.estimateLine.findMany
        .mockResolvedValueOnce([
          { id: "line-1", quantity: 10, lineTotal: 500, costCodeId: "cc-1", costCode: { name: "Concrete" } },
        ])
        .mockResolvedValueOnce([
          { costCodeId: "cc-1", quantity: 10, lineTotal: 100 },
          { costCodeId: "cc-1", quantity: 10, lineTotal: 100 },
        ]);

      const result = await service.benchmarkForEstimate(COMPANY_A, "estimate-1");

      expect(result[0]).toMatchObject({ unitPrice: 50, benchmarkMedian: 10, benchmarkSampleSize: 2, deviationPercent: 400 });
    });

    it("excludes the estimate under review from its own comparison history", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "estimate-1" });
      prisma.estimateLine.findMany.mockResolvedValueOnce([
        { id: "line-1", quantity: 10, lineTotal: 500, costCodeId: "cc-1", costCode: { name: "Concrete" } },
      ]);
      prisma.estimateLine.findMany.mockResolvedValueOnce([]);

      await service.benchmarkForEstimate(COMPANY_A, "estimate-1");

      const historyCall = prisma.estimateLine.findMany.mock.calls[1][0];
      expect(historyCall.where.estimate.id).toEqual({ not: "estimate-1" });
    });

    it("skips a cost code with fewer than 2 historical samples", async () => {
      prisma.estimate.findFirst.mockResolvedValue({ id: "estimate-1" });
      prisma.estimateLine.findMany
        .mockResolvedValueOnce([
          { id: "line-1", quantity: 10, lineTotal: 500, costCodeId: "cc-1", costCode: { name: "Concrete" } },
        ])
        .mockResolvedValueOnce([{ costCodeId: "cc-1", quantity: 10, lineTotal: 100 }]);

      const result = await service.benchmarkForEstimate(COMPANY_A, "estimate-1");

      expect(result).toEqual([]);
    });
  });
});
