import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const MIN_BENCHMARK_SAMPLE = 2;

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface CostCodeBenchmark {
  costCodeId: string;
  code: string;
  name: string;
  sampleSize: number;
  medianUnitPrice: number;
  averageUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
}

export interface EstimateLineBenchmark {
  estimateLineId: string;
  costCodeId: string;
  costCodeName: string;
  unitPrice: number;
  benchmarkMedian: number;
  benchmarkSampleSize: number;
  deviationPercent: number;
}

@Injectable()
export class CostBenchmarkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Median/average/min/max unit price (line total ÷ quantity) per CSI cost code, computed purely
   * from the company's own approved-estimate history — no external pricing data or LLM.
   */
  async costCodeBenchmarks(companyId: string): Promise<CostCodeBenchmark[]> {
    const costCodes = await this.prisma.costCode.findMany({
      where: { companyId },
      include: {
        estimateLines: {
          where: { estimate: { companyId, status: "approved" }, quantity: { gt: 0 } },
          select: { lineTotal: true, quantity: true },
        },
      },
      orderBy: { code: "asc" },
    });

    return costCodes
      .map((cc): CostCodeBenchmark | null => {
        const unitPrices = cc.estimateLines.map((l) => Number(l.lineTotal) / Number(l.quantity)).sort((a, b) => a - b);
        if (unitPrices.length === 0) return null;
        return {
          costCodeId: cc.id,
          code: cc.code,
          name: cc.name,
          sampleSize: unitPrices.length,
          medianUnitPrice: round2(median(unitPrices)),
          averageUnitPrice: round2(unitPrices.reduce((s, p) => s + p, 0) / unitPrices.length),
          minUnitPrice: round2(unitPrices[0]),
          maxUnitPrice: round2(unitPrices[unitPrices.length - 1]),
        };
      })
      .filter((r): r is CostCodeBenchmark => r !== null);
  }

  /**
   * Flags one estimate's own lines against the company-wide cost-code benchmark. The estimate
   * being checked is excluded from its own comparison set — otherwise a single large estimate
   * would validate itself instead of being measured against the rest of the company's history.
   */
  async benchmarkForEstimate(companyId: string, estimateId: string): Promise<EstimateLineBenchmark[]> {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId }, select: { id: true } });
    if (!estimate) throw new NotFoundException("Estimate not found");

    const lines = await this.prisma.estimateLine.findMany({
      where: { estimateId, costCodeId: { not: null }, quantity: { gt: 0 } },
      select: { id: true, quantity: true, lineTotal: true, costCodeId: true, costCode: { select: { name: true } } },
    });
    if (lines.length === 0) return [];

    const costCodeIds = [...new Set(lines.map((l) => l.costCodeId as string))];
    const history = await this.prisma.estimateLine.findMany({
      where: {
        costCodeId: { in: costCodeIds },
        estimate: { companyId, status: "approved", id: { not: estimateId } },
        quantity: { gt: 0 },
      },
      select: { costCodeId: true, quantity: true, lineTotal: true },
    });

    const pricesByCode = new Map<string, number[]>();
    for (const h of history) {
      const codeId = h.costCodeId as string;
      const arr = pricesByCode.get(codeId) ?? [];
      arr.push(Number(h.lineTotal) / Number(h.quantity));
      pricesByCode.set(codeId, arr);
    }

    const results: EstimateLineBenchmark[] = [];
    for (const line of lines) {
      const codeId = line.costCodeId as string;
      const prices = (pricesByCode.get(codeId) ?? []).sort((a, b) => a - b);
      if (prices.length < MIN_BENCHMARK_SAMPLE) continue;

      const benchmarkMedian = median(prices);
      const unitPrice = Number(line.lineTotal) / Number(line.quantity);
      results.push({
        estimateLineId: line.id,
        costCodeId: codeId,
        costCodeName: line.costCode?.name ?? "",
        unitPrice: round2(unitPrice),
        benchmarkMedian: round2(benchmarkMedian),
        benchmarkSampleSize: prices.length,
        deviationPercent: benchmarkMedian > 0 ? Math.round(((unitPrice - benchmarkMedian) / benchmarkMedian) * 1000) / 10 : 0,
      });
    }
    return results;
  }
}
