import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { toCsv } from "../common/csv";

export interface LaborCostReportFilter {
  from?: string;
  to?: string;
}

/**
 * Cross-project labor cost, grouped by worker and by role. Uses each entry's
 * hourlyCostSnapshot when present (captured at logging time) so past periods
 * don't shift when a worker's current rate changes; falls back to the
 * worker's live rate for entries logged before the snapshot was introduced.
 */
@Injectable()
export class LaborCostService {
  constructor(private readonly prisma: PrismaService) {}

  async report(companyId: string, filter: LaborCostReportFilter) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        companyId,
        ...(filter.from || filter.to
          ? {
              date: {
                ...(filter.from ? { gte: new Date(filter.from) } : {}),
                ...(filter.to ? { lte: new Date(filter.to) } : {}),
              },
            }
          : {}),
      },
      include: { worker: true },
    });

    const byWorker = new Map<
      string,
      { workerId: string; workerName: string; role: string | null; hours: number; cost: number; uncostedHours: number }
    >();
    const byRole = new Map<string, { role: string; hours: number; cost: number }>();
    let totalHours = 0;
    let totalCost = 0;
    let totalUncostedHours = 0;

    for (const entry of entries) {
      const hours = Number(entry.hours);
      const rate = entry.hourlyCostSnapshot !== null ? Number(entry.hourlyCostSnapshot) : entry.worker.hourlyCost !== null ? Number(entry.worker.hourlyCost) : null;
      const cost = rate !== null ? hours * rate : 0;
      totalHours += hours;
      totalCost += cost;
      if (rate === null) totalUncostedHours += hours;

      const existing = byWorker.get(entry.workerId);
      if (existing) {
        existing.hours += hours;
        existing.cost += cost;
        if (rate === null) existing.uncostedHours += hours;
      } else {
        byWorker.set(entry.workerId, {
          workerId: entry.workerId,
          workerName: entry.worker.name,
          role: entry.worker.role,
          hours,
          cost,
          uncostedHours: rate === null ? hours : 0,
        });
      }

      const roleKey = entry.worker.role ?? "—";
      const roleExisting = byRole.get(roleKey);
      if (roleExisting) {
        roleExisting.hours += hours;
        roleExisting.cost += cost;
      } else {
        byRole.set(roleKey, { role: roleKey, hours, cost });
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      totalHours: round(totalHours),
      totalCost: round(totalCost),
      totalUncostedHours: round(totalUncostedHours),
      byWorker: Array.from(byWorker.values())
        .map((w) => ({ ...w, hours: round(w.hours), cost: round(w.cost), uncostedHours: round(w.uncostedHours) }))
        .sort((a, b) => b.cost - a.cost),
      byRole: Array.from(byRole.values())
        .map((r) => ({ ...r, hours: round(r.hours), cost: round(r.cost) }))
        .sort((a, b) => b.cost - a.cost),
    };
  }

  /** One row per worker for the given period — generic enough to import into ADP, Gusto, or
   * QuickBooks Payroll's "hours + rate" CSV import, rather than any one provider's exact schema. */
  async payrollExportCsv(companyId: string, filter: LaborCostReportFilter): Promise<string> {
    const { byWorker } = await this.report(companyId, filter);
    const workers = await this.prisma.worker.findMany({
      where: { companyId, id: { in: byWorker.map((w) => w.workerId) } },
      include: { user: { select: { email: true } } },
    });
    const emailByWorkerId = new Map(workers.map((w) => [w.id, w.user?.email ?? ""]));

    return toCsv(
      ["Worker", "Email", "Role", "Hours", "Rate", "Gross Pay"],
      byWorker.map((w) => [
        w.workerName,
        emailByWorkerId.get(w.workerId) ?? "",
        w.role ?? "",
        w.hours.toString(),
        w.hours > 0 ? (w.cost / w.hours).toFixed(2) : "0.00",
        w.cost.toFixed(2),
      ]),
    );
  }
}
