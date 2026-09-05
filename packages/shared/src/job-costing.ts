import { z } from "zod";

export const createCostCodeBudgetTransferSchema = z.object({
  projectId: z.string().uuid(),
  fromCostCodeId: z.string().uuid(),
  toCostCodeId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(1).max(500),
});
export type CreateCostCodeBudgetTransferInput = z.infer<typeof createCostCodeBudgetTransferSchema>;
