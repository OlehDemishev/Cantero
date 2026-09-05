import { z } from "zod";

export const logProductivitySchema = z.object({
  costCodeId: z.string().uuid().optional(),
  workDate: z.string().datetime(),
  quantityCompleted: z.number().positive(),
  unit: z.string().min(1).max(20),
  laborHours: z.number().positive(),
  crewName: z.string().max(160).optional(),
  notes: z.string().max(500).optional(),
});
export type LogProductivityInput = z.infer<typeof logProductivitySchema>;
