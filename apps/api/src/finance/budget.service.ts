import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBudgetRevisionInput, CreateContingencyDrawInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { runSerializable } from "../common/prisma/serializable-transaction";

/**
 * Budget-vs-actual per project. Materials are compared at the catalog's
 * current unit price. Labor is valued at each entry's hourlyCostSnapshot
 * (the worker's rate at the time it was logged), falling back to the
 * worker's current hourlyCost for entries logged before the snapshot field
 * existed — so past reports don't shift when a worker's rate later changes.
 * Hours with no rate available at all are counted in `laborHoursLogged` but
 * excluded from `laborCostActual` (reported separately as
 * `laborHoursUncosted`) rather than silently treated as zero cost.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getForProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const approvedEstimates = await this.prisma.estimate.findMany({
      where: { projectId, companyId, status: "approved" },
    });
    const materialsCostBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.materialsCostTotal), 0);
    const laborCostBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.laborCostTotal), 0);
    const grandTotalBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);

    const revisions = await this.prisma.budgetRevision.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } });
    const budgetRevisionsTotal = revisions.reduce((sum, r) => sum + Number(r.amount), 0);

    const contingencyDraws = await this.prisma.contingencyDraw.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "desc" } });
    const contingencyDrawnTotal = contingencyDraws.reduce((sum, d) => sum + Number(d.amount), 0);
    const contingencyAmount = project.contingencyAmount !== null ? Number(project.contingencyAmount) : null;

    const consumptionMovements = await this.prisma.stockMovement.findMany({
      where: { companyId, projectId, type: { in: ["issue", "write_off"] } },
      include: { materialCatalogItem: true },
    });
    const materialsCostActual = consumptionMovements.reduce(
      (sum, m) => sum + Number(m.quantity) * Number(m.materialCatalogItem.defaultUnitPrice),
      0,
    );

    const timeEntries = await this.prisma.timeEntry.findMany({
      where: { companyId, projectId },
      include: { worker: true },
    });
    let laborCostActual = 0;
    let laborHoursLogged = 0;
    let laborHoursUncosted = 0;
    for (const entry of timeEntries) {
      const hours = Number(entry.hours);
      laborHoursLogged += hours;
      const rate = entry.hourlyCostSnapshot !== null ? Number(entry.hourlyCostSnapshot) : entry.worker.hourlyCost !== null ? Number(entry.worker.hourlyCost) : null;
      if (rate !== null) {
        laborCostActual += hours * rate;
      } else {
        laborHoursUncosted += hours;
      }
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, projectId },
      include: { payments: true },
    });
    const invoicedTotal = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const paidTotal = invoices.reduce(
      (sum, i) => sum + i.payments.reduce((pSum, p) => pSum + Number(p.amount), 0),
      0,
    );

    // Counted as actual the moment it's logged, same convention as materials at issue-time —
    // no budget counterpart exists yet since estimates don't plan for subcontractor spend.
    const subcontractorCosts = await this.prisma.subcontractorCost.findMany({ where: { companyId, projectId } });
    const subcontractorCostActual = subcontractorCosts.reduce((sum, c) => sum + Number(c.amount), 0);
    const subcontractorCostUnpaid = subcontractorCosts
      .filter((c) => !c.paid)
      .reduce((sum, c) => sum + Number(c.amount), 0);

    return {
      projectId,
      estimatesCount: approvedEstimates.length,
      materialsCostBudget: round2(materialsCostBudget),
      materialsCostActual: round2(materialsCostActual),
      materialsCostVariance: round2(materialsCostBudget - materialsCostActual),
      laborCostBudget: round2(laborCostBudget),
      laborCostActual: round2(laborCostActual),
      laborCostVariance: round2(laborCostBudget - laborCostActual),
      laborHoursLogged: round2(laborHoursLogged),
      laborHoursUncosted: round2(laborHoursUncosted),
      subcontractorCostActual: round2(subcontractorCostActual),
      subcontractorCostUnpaid: round2(subcontractorCostUnpaid),
      grandTotalBudget: round2(grandTotalBudget),
      budgetRevisionsTotal: round2(budgetRevisionsTotal),
      revisedBudgetTotal: round2(grandTotalBudget + budgetRevisionsTotal),
      revisions: revisions.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        reason: r.reason,
        createdByName: r.createdByName,
        createdAt: r.createdAt,
      })),
      invoicedTotal: round2(invoicedTotal),
      paidTotal: round2(paidTotal),
      outstandingTotal: round2(invoicedTotal - paidTotal),
      contingencyAmount: contingencyAmount !== null ? round2(contingencyAmount) : null,
      contingencyDrawnTotal: round2(contingencyDrawnTotal),
      contingencyRemaining: contingencyAmount !== null ? round2(contingencyAmount - contingencyDrawnTotal) : null,
      contingencyDraws: contingencyDraws.map((d) => ({
        id: d.id,
        amount: Number(d.amount),
        reason: d.reason,
        createdByName: d.createdByName,
        createdAt: d.createdAt,
      })),
    };
  }

  /** The over-the-limit check reads every existing draw and sums them before inserting the new
   * one — two concurrent draws on the same project could otherwise both read the same "drawn so
   * far" snapshot, both pass the check, and together exceed the reserve. Serializable isolation
   * makes Postgres abort one of the two with a write-conflict error (P2034) instead of letting
   * both commit; this retries that specific error with a fresh read rather than surfacing it to
   * the caller as a spurious failure. */
  async addContingencyDraw(companyId: string, actor: AuditActor, input: CreateContingencyDrawInput) {
    const { draw, projectName } = await runSerializable(this.prisma, async (tx) => {
      const project = await tx.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
      if (project.contingencyAmount === null) {
        throw new BadRequestException("This project has no contingency reserve set — set one first");
      }

      const draws = await tx.contingencyDraw.findMany({ where: { companyId, projectId: input.projectId } });
      const drawnSoFar = draws.reduce((sum, d) => sum + Number(d.amount), 0);
      if (drawnSoFar + input.amount > Number(project.contingencyAmount)) {
        throw new BadRequestException("This draw would exceed the remaining contingency reserve");
      }

      const draw = await tx.contingencyDraw.create({
        data: { companyId, projectId: input.projectId, amount: input.amount, reason: input.reason, createdByUserId: actor.userId, createdByName: actor.name },
      });
      return { draw, projectName: project.name };
    });

    this.audit.record(
      companyId,
      actor,
      "contingency_draw.created",
      "ContingencyDraw",
      draw.id,
      `Drew ${input.amount} from the contingency reserve on "${projectName}": ${input.reason}`,
    );
    return draw;
  }

  async addRevision(companyId: string, actor: AuditActor, input: CreateBudgetRevisionInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const revision = await this.prisma.budgetRevision.create({
      data: { companyId, projectId: input.projectId, amount: input.amount, reason: input.reason, createdByUserId: actor.userId, createdByName: actor.name },
    });
    this.audit.record(
      companyId,
      actor,
      "budget_revision.created",
      "BudgetRevision",
      revision.id,
      `Recorded a budget revision of ${input.amount >= 0 ? "+" : ""}${input.amount} on "${project.name}": ${input.reason}`,
    );
    return revision;
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
