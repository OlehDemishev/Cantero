import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { toCsv } from "../common/csv";
import { calculatePayrollHours } from "./payroll-hours";

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

  /** Regular/overtime hours per worker (see calculatePayrollHours) plus each worker's rate, keyed
   * by their self-reported payrollEmployeeId — falls back to their name when that's unset, so the
   * row is still identifiable even before anyone's filled the ID in on their worker profile. */
  private async payrollHoursWithRate(companyId: string, filter: LaborCostReportFilter) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        companyId,
        ...(filter.from || filter.to
          ? { date: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
          : {}),
      },
      select: { workerId: true, hours: true, date: true, hourlyCostSnapshot: true },
    });
    const lines = calculatePayrollHours(entries.map((e) => ({ workerId: e.workerId, hours: Number(e.hours), date: e.date })));

    const workerIds = [...new Set(entries.map((e) => e.workerId))];
    const workers = await this.prisma.worker.findMany({ where: { companyId, id: { in: workerIds } } });
    const workerById = new Map(workers.map((w) => [w.id, w]));

    // Snapshot-first rate, same fallback the cross-project labor-cost report above uses — the
    // most recent entry's snapshot for a worker stands in when the live worker.hourlyCost is null.
    const latestSnapshotByWorker = new Map<string, number>();
    for (const e of entries) {
      if (e.hourlyCostSnapshot !== null) latestSnapshotByWorker.set(e.workerId, Number(e.hourlyCostSnapshot));
    }

    return lines
      .map((line) => {
        const worker = workerById.get(line.workerId);
        const rate = worker && worker.hourlyCost !== null ? Number(worker.hourlyCost) : (latestSnapshotByWorker.get(line.workerId) ?? null);
        return { ...line, worker, rate };
      })
      .filter((line): line is typeof line & { worker: NonNullable<typeof line.worker> } => !!line.worker)
      .sort((a, b) => a.worker.name.localeCompare(b.worker.name));
  }

  /** ADP hours-import layout (Employee ID / Name / period / Reg / O/T / Rate) — a familiar
   * starting point for ADP Workforce Now's bulk hours import, not a validated official template. */
  async payrollExportAdpCsv(companyId: string, filter: LaborCostReportFilter): Promise<string> {
    const lines = await this.payrollHoursWithRate(companyId, filter);
    return toCsv(
      ["Employee ID", "Employee Name", "Pay Period Start", "Pay Period End", "Reg Hours", "O/T Hours", "Rate"],
      lines.map((l) => [
        l.worker.payrollEmployeeId ?? l.worker.name,
        l.worker.name,
        filter.from ?? "",
        filter.to ?? "",
        l.regularHours.toString(),
        l.overtimeHours.toString(),
        l.rate !== null ? l.rate.toFixed(2) : "",
      ]),
    );
  }

  /** Gusto hours-import layout (Employee ID / first+last name split from Worker.name / Reg /
   * O/T) — first/last is a best-effort split on the first space, not a real structured name. */
  async payrollExportGustoCsv(companyId: string, filter: LaborCostReportFilter): Promise<string> {
    const lines = await this.payrollHoursWithRate(companyId, filter);
    return toCsv(
      ["Employee ID", "First Name", "Last Name", "Regular Hours", "Overtime Hours"],
      lines.map((l) => {
        const spaceIndex = l.worker.name.indexOf(" ");
        const firstName = spaceIndex === -1 ? l.worker.name : l.worker.name.slice(0, spaceIndex);
        const lastName = spaceIndex === -1 ? "" : l.worker.name.slice(spaceIndex + 1);
        return [l.worker.payrollEmployeeId ?? l.worker.name, firstName, lastName, l.regularHours.toString(), l.overtimeHours.toString()];
      }),
    );
  }
}
