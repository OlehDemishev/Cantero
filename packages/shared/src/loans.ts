import { z } from "zod";

export const LOAN_STATUSES = ["active", "paid_off", "defaulted"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const createLoanSchema = z.object({
  equipmentId: z.string().uuid().optional(),
  lenderName: z.string().min(1).max(200),
  principal: z.number().positive(),
  interestRatePercent: z.number().nonnegative().max(100),
  termMonths: z.number().int().positive().max(600),
  startDate: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const recordLoanPaymentSchema = z.object({
  paidAmount: z.number().positive(),
});
export type RecordLoanPaymentInput = z.infer<typeof recordLoanPaymentSchema>;
