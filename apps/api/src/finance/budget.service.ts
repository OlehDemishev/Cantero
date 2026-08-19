import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  async getForProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const approvedEstimates = await this.prisma.estimate.findMany({
      where: { projectId, companyId, status: "approved" },
    });
    const materialsCostBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.materialsCostTotal), 0);
    const laborCostBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.laborCostTotal), 0);
    const grandTotalBudget = approvedEstimates.reduce((sum, e) => sum + Number(e.grandTotal), 0);

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
      invoicedTotal: round2(invoicedTotal),
      paidTotal: round2(paidTotal),
      outstandingTotal: round2(invoicedTotal - paidTotal),
    };
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
