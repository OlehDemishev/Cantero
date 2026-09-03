const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type ApAgingBucket = "current" | "days1to30" | "days31to60" | "days61to90" | "over90";

export interface ApAgingBillInput {
  id: string;
  billNumber: string;
  supplierName: string;
  amount: number;
  dueDate: Date | null;
}

export interface ApAgingBillResult extends ApAgingBillInput {
  daysPastDue: number;
  bucket: ApAgingBucket;
}

export interface ApAgingReport {
  bills: ApAgingBillResult[];
  totalsByBucket: Record<ApAgingBucket, number>;
  grandTotal: number;
}

function bucketFor(daysPastDue: number): ApAgingBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "days1to30";
  if (daysPastDue <= 60) return "days31to60";
  if (daysPastDue <= 90) return "days61to90";
  return "over90";
}

/** A bill with no dueDate yet is treated as not-yet-due (bucket "current"), same as one whose
 * due date hasn't arrived — it isn't yet overdue, it's just missing a payment-terms date. */
export function calculateApAging(bills: ApAgingBillInput[], asOf: Date): ApAgingReport {
  const totalsByBucket: Record<ApAgingBucket, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };

  const results = bills.map((bill) => {
    const daysPastDue = bill.dueDate ? Math.floor((asOf.getTime() - bill.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : -1;
    const bucket = bucketFor(daysPastDue);
    totalsByBucket[bucket] = round2(totalsByBucket[bucket] + bill.amount);
    return { ...bill, daysPastDue: Math.max(daysPastDue, 0), bucket };
  });

  const grandTotal = round2(Object.values(totalsByBucket).reduce((sum, v) => sum + v, 0));
  return { bills: results, totalsByBucket, grandTotal };
}
