import { z } from "zod";

export const createCostCodeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
});
export type CreateCostCodeInput = z.infer<typeof createCostCodeSchema>;

export const updateCostCodeSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(160).optional(),
});
export type UpdateCostCodeInput = z.infer<typeof updateCostCodeSchema>;
