export interface BillForDisbursement {
  id: string;
  billNumber: string;
  supplierName: string;
  amount: number;
  /** scheduledPaymentDate if set, else dueDate — the date this bill is actually expected to be paid. */
  paymentDate: Date | null;
}
export interface DisbursementBucket {
  weekStart: Date;
  weekEnd: Date;
  total: number;
  bills: BillForDisbursement[];
}
export interface DisbursementCalendar {
  buckets: DisbursementBucket[];
  /** No scheduledPaymentDate and no dueDate at all — nothing to bucket, surfaced separately rather than dropped. */
  unscheduledTotal: number;
  unscheduledBills: BillForDisbursement[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Buckets approved-but-unpaid vendor bills into weekly cash-outflow windows starting today, so the
 * office can see what's coming due — same "past due collapses into week 0, unscheduled is called
 * out rather than dropped" convention as reports.service.ts's cashFlowForecast().
 */
export function calculateDisbursementCalendar(bills: BillForDisbursement[], weeks: number, referenceDate: Date): DisbursementCalendar {
  const windowStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));

  const buckets: DisbursementBucket[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(windowStart.getTime() + i * WEEK_MS);
    return { weekStart, weekEnd: new Date(weekStart.getTime() + WEEK_MS), total: 0, bills: [] };
  });

  let unscheduledTotal = 0;
  const unscheduledBills: BillForDisbursement[] = [];

  for (const bill of bills) {
    if (!bill.paymentDate) {
      unscheduledTotal += bill.amount;
      unscheduledBills.push(bill);
      continue;
    }
    const idx = bill.paymentDate.getTime() < windowStart.getTime() ? 0 : Math.floor((bill.paymentDate.getTime() - windowStart.getTime()) / WEEK_MS);
    // A bill dated beyond the window is out of scope for this calendar, same as
    // cashFlowForecast's own "idx < CASH_FLOW_WEEKS" bounds check — it isn't "unscheduled".
    if (idx < weeks) {
      buckets[idx].total += bill.amount;
      buckets[idx].bills.push(bill);
    }
  }

  return { buckets, unscheduledTotal, unscheduledBills };
}
