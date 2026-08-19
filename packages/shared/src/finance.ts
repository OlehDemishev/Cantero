import { z } from "zod";

export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
