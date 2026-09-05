import { z } from "zod";

export const TASK_COMMITMENT_STATUSES = ["committed", "completed", "missed"] as const;
export type TaskCommitmentStatus = (typeof TASK_COMMITMENT_STATUSES)[number];

export const createTaskCommitmentSchema = z.object({
  weekStarting: z.string().datetime(),
});
export type CreateTaskCommitmentInput = z.infer<typeof createTaskCommitmentSchema>;

export const resolveTaskCommitmentSchema = z.object({
  status: z.enum(["completed", "missed"]),
  varianceReason: z.string().max(500).optional(),
});
export type ResolveTaskCommitmentInput = z.infer<typeof resolveTaskCommitmentSchema>;
