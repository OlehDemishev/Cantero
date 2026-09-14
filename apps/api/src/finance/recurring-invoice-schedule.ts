import type { RecurringInvoiceFrequency } from "@cantero/shared";
import { addMonthsUtc } from "../common/date-utils";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Advances a schedule date by one cycle in UTC — avoids local-timezone month/DST drift on repeated calls. */
export function advanceDate(date: Date, frequency: RecurringInvoiceFrequency): Date {
  switch (frequency) {
    case "weekly": {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case "monthly":
      return addMonthsUtc(date, 1);
    case "quarterly":
      return addMonthsUtc(date, 3);
    case "yearly":
      return addMonthsUtc(date, 12);
  }
}

export interface RecurringLineForCalc {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface RecurringInvoiceCalc {
  lines: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function calculateRecurringInvoice(lines: RecurringLineForCalc[], taxPercent: number): RecurringInvoiceCalc {
  const calcLines = lines.map((l) => ({ ...l, lineTotal: round2(l.quantity * l.unitPrice) }));
  const subtotal = round2(calcLines.reduce((sum, l) => sum + l.lineTotal, 0));
  const taxAmount = round2(subtotal * (taxPercent / 100));
  return { lines: calcLines, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}
