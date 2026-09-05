import { z } from "zod";

export const ALLOWANCE_STATUSES = ["active", "exceeded", "closed"] as const;
export type AllowanceStatus = (typeof ALLOWANCE_STATUSES)[number];

export const createAllowanceSchema = z.object({
  name: z.string().min(1).max(160),
  budgetedAmount: z.number().positive(),
  notes: z.string().max(2000).optional(),
});
export type CreateAllowanceInput = z.infer<typeof createAllowanceSchema>;

export const addAllowanceChargeSchema = z.object({
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  createdByName: z.string().max(160).optional(),
});
export type AddAllowanceChargeInput = z.infer<typeof addAllowanceChargeSchema>;
