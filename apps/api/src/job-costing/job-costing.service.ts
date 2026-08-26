import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

interface CostCodeBucket {
  costCodeId: string | null;
  code: string;
  name: string;
  estimated: number;
  committed: number;
  actual: number;
}

const UNCATEGORIZED_CODE = "—";

@Injectable()
export class JobCostingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estimated vs. committed vs. actual, rolled up by CSI cost code, for one project.
   * "Estimated" is the approved estimate's lines plus any internally-approved change order
   * lines (contract value). "Committed"/"actual" come from SubcontractorCost — unpaid vs. paid.
   * Purchase orders aren't project-scoped in this system (they restock a warehouse, not a job),
   * so material costs aren't part of this report — a deliberate scope limit, not an oversight.
   */
  async report(companyId: string, projectId: string) {
    const [estimates, costCodes] = await Promise.all([
      this.prisma.estimate.findMany({
        where: { companyId, projectId, isTemplate: false, status: "approved" },
        select: { id: true },
      }),
      this.prisma.costCode.findMany({ where: { companyId } }),
    ]);
    const estimateIds = estimates.map((e) => e.id);
    const codeById = new Map(costCodes.map((c) => [c.id, c]));

    const [estimateLines, changeOrderLines, subcontractorCosts] = await Promise.all([
      estimateIds.length > 0
        ? this.prisma.estimateLine.findMany({ where: { estimateId: { in: estimateIds } }, select: { costCodeId: true, lineTotal: true } })
        : Promise.resolve([]),
      estimateIds.length > 0
        ? this.prisma.changeOrderLine.findMany({
            where: { changeOrder: { estimateId: { in: estimateIds }, status: "approved" } },
            select: { costCodeId: true, lineTotal: true },
          })
        : Promise.resolve([]),
      this.prisma.subcontractorCost.findMany({ where: { companyId, projectId }, select: { costCodeId: true, amount: true, paid: true } }),
    ]);

    const buckets = new Map<string, CostCodeBucket>();
    const bucketFor = (costCodeId: string | null): CostCodeBucket => {
      const key = costCodeId ?? "uncategorized";
      if (!buckets.has(key)) {
        const costCode = costCodeId ? codeById.get(costCodeId) : undefined;
        buckets.set(key, {
          costCodeId,
          code: costCode?.code ?? UNCATEGORIZED_CODE,
          name: costCode?.name ?? "Uncategorized",
          estimated: 0,
          committed: 0,
          actual: 0,
        });
      }
      return buckets.get(key)!;
    };

    for (const line of estimateLines) bucketFor(line.costCodeId).estimated += Number(line.lineTotal);
    for (const line of changeOrderLines) bucketFor(line.costCodeId).estimated += Number(line.lineTotal);
    for (const cost of subcontractorCosts) {
      const bucket = bucketFor(cost.costCodeId);
      if (cost.paid) bucket.actual += Number(cost.amount);
      else bucket.committed += Number(cost.amount);
    }

    const rows = Array.from(buckets.values())
      .map((b) => ({ ...b, variance: b.estimated - (b.committed + b.actual) }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totals = rows.reduce(
      (sum, r) => ({
        estimated: sum.estimated + r.estimated,
        committed: sum.committed + r.committed,
        actual: sum.actual + r.actual,
        variance: sum.variance + r.variance,
      }),
      { estimated: 0, committed: 0, actual: 0, variance: 0 },
    );

    return { rows, totals };
  }
}
