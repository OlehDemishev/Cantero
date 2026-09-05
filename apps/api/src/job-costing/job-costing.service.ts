import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCostCodeBudgetTransferInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateCostCodeEac } from "./cost-code-eac";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Estimated vs. committed vs. actual, rolled up by CSI cost code, for one project.
   * "Estimated" is the approved estimate's lines plus any internally-approved change order
   * lines (contract value), adjusted by any CostCodeBudgetTransfer moved in/out of that code —
   * see addBudgetTransfer(). "Committed"/"actual" come from SubcontractorCost — unpaid vs. paid.
   * Purchase orders aren't project-scoped in this system (they restock a warehouse, not a job),
   * so material costs aren't part of this report — a deliberate scope limit, not an oversight.
   */
  async report(companyId: string, projectId: string) {
    const [estimates, costCodes, transfers] = await Promise.all([
      this.prisma.estimate.findMany({
        where: { companyId, projectId, isTemplate: false, status: "approved" },
        select: { id: true },
      }),
      this.prisma.costCode.findMany({ where: { companyId } }),
      this.prisma.costCodeBudgetTransfer.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } }),
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
    for (const transfer of transfers) {
      bucketFor(transfer.fromCostCodeId).estimated -= Number(transfer.amount);
      bucketFor(transfer.toCostCodeId).estimated += Number(transfer.amount);
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

    return {
      rows,
      totals,
      transfers: transfers.map((t) => ({
        id: t.id,
        fromCostCodeId: t.fromCostCodeId,
        fromCode: codeById.get(t.fromCostCodeId)?.code ?? UNCATEGORIZED_CODE,
        toCostCodeId: t.toCostCodeId,
        toCode: codeById.get(t.toCostCodeId)?.code ?? UNCATEGORIZED_CODE,
        amount: Number(t.amount),
        reason: t.reason,
        createdByName: t.createdByName,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Moves budget between two cost codes on the same project. Capped at the source code's
   * currently *remaining* budget (estimated minus committed and actual, per report() above) so a
   * transfer can't manufacture headroom that was never there — the same "can't exceed what's
   * left" rule BudgetService.addContingencyDraw() applies to the contingency reserve.
   */
  async addBudgetTransfer(companyId: string, actor: AuditActor, input: CreateCostCodeBudgetTransferInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    if (input.fromCostCodeId === input.toCostCodeId) {
      throw new BadRequestException("Cannot transfer budget from a cost code to itself");
    }

    const costCodes = await this.prisma.costCode.findMany({
      where: { id: { in: [input.fromCostCodeId, input.toCostCodeId] }, companyId },
    });
    const fromCostCode = costCodes.find((c) => c.id === input.fromCostCodeId);
    const toCostCode = costCodes.find((c) => c.id === input.toCostCodeId);
    if (!fromCostCode || !toCostCode) throw new NotFoundException("Cost code not found");

    const { rows } = await this.report(companyId, input.projectId);
    const fromRow = rows.find((r) => r.costCodeId === input.fromCostCodeId);
    const remaining = fromRow ? fromRow.estimated - fromRow.committed - fromRow.actual : 0;
    if (input.amount > remaining) {
      throw new BadRequestException(`This transfer would exceed ${fromCostCode.code}'s remaining budget (${remaining.toFixed(2)})`);
    }

    const transfer = await this.prisma.costCodeBudgetTransfer.create({
      data: {
        companyId,
        projectId: input.projectId,
        fromCostCodeId: input.fromCostCodeId,
        toCostCodeId: input.toCostCodeId,
        amount: input.amount,
        reason: input.reason,
        createdByUserId: actor.userId,
        createdByName: actor.name,
      },
    });
    this.audit.record(
      companyId,
      actor,
      "cost_code_budget_transfer.created",
      "CostCodeBudgetTransfer",
      transfer.id,
      `Moved ${input.amount} from ${fromCostCode.code} to ${toCostCode.code} on "${project.name}": ${input.reason}`,
    );
    return transfer;
  }

  /**
   * The cost-code report() above, augmented with a per-code and total EAC forecast — see
   * cost-code-eac.ts. Reuses the project's overall progress-billing percentComplete (furthest
   * invoice draw so far, 0 when none exists yet) as the completion basis for every cost code,
   * the same convention reports.service.ts's estimateAtCompletion() uses at the whole-project
   * level — this system has no way to bill or track progress per cost code independently.
   */
  async forecastReport(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: { invoices: { select: { percentComplete: true } } },
    });
    if (!project) throw new NotFoundException("Project not found");

    const percentComplete = project.invoices.reduce(
      (max, inv) => (inv.percentComplete !== null ? Math.max(max, Number(inv.percentComplete)) : max),
      0,
    );

    const { rows, totals, transfers } = await this.report(companyId, projectId);

    const forecastRows = rows.map((row) => ({ ...row, ...calculateCostCodeEac({ ...row, percentComplete }) }));
    const forecastTotals = { ...totals, ...calculateCostCodeEac({ ...totals, percentComplete }) };

    return { percentComplete, rows: forecastRows, totals: forecastTotals, transfers };
  }
}
