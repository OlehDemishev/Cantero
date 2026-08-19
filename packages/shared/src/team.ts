import { z } from "zod";

export const createWorkerSchema = z.object({
  name: z.string().min(1).max(160),
  role: z.string().max(80).optional(),
  hourlyCost: z.number().nonnegative().optional(),
});
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

export const createTimeEntrySchema = z.object({
  workerId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  hours: z.number().positive().max(24),
  date: z.string().datetime(),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
