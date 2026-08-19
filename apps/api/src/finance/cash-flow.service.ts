import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Company-wide cash-flow forecast: expected inflow (unpaid balance on sent
 * invoices) against expected outflow (unreceived purchase orders + unpaid
 * subcontractor bills), bucketed by month of the relevant date field. Items
 * with a past due date land in "overdue"; items with no date at all land in
 * "unscheduled" and are excluded from the running balance since their timing
 * is genuinely unknown rather than just far away.
 */
@Injectable()
export class CashFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async getForecast(companyId: string, monthsAhead = 6) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const months: string[] = [];
    for (let i = 0; i < monthsAhead; i++) {
      months.push(monthKey(new Date(today.getFullYear(), today.getMonth() + i, 1)));
    }

    const buckets: Record<string, { inflow: number; outflow: number }> = {
      overdue: { inflow: 0, outflow: 0 },
    };
    for (const m of months) buckets[m] = { inflow: 0, outflow: 0 };
    buckets.unscheduled = { inflow: 0, outflow: 0 };

    const bucketFor = (date: Date | null): string => {
      if (!date) return "unscheduled";
      if (date < today) return "overdue";
      const key = monthKey(date);
      return key in buckets ? key : months[months.length - 1];
    };

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: "sent" },
      include: { payments: true },
    });
    for (const inv of invoices) {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const outstanding = Number(inv.total) - paid;
      if (outstanding <= 0) continue;
      buckets[bucketFor(inv.dueDate)].inflow += outstanding;
    }

    const openPurchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, status: { in: ["draft", "ordered"] } },
      include: { lines: true },
    });
    for (const po of openPurchaseOrders) {
      const total = po.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
      if (total <= 0) continue;
      buckets[bucketFor(po.expectedDate)].outflow += total;
    }

    const unpaidSubcontractorCosts = await this.prisma.subcontractorCost.findMany({
      where: { companyId, paid: false },
    });
    for (const cost of unpaidSubcontractorCosts) {
      buckets[bucketFor(cost.dueDate)].outflow += Number(cost.amount);
    }

    const orderedKeys = ["overdue", ...months, "unscheduled"];
    let runningBalance = 0;
    const series = orderedKeys.map((key) => {
      const b = buckets[key];
      const net = round2(b.inflow - b.outflow);
      if (key !== "unscheduled") runningBalance += net;
      return { bucket: key, inflow: round2(b.inflow), outflow: round2(b.outflow), net, runningBalance: round2(runningBalance) };
    });

    return { generatedAt: today.toISOString(), series };
  }
}
