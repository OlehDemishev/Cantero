import { z } from "zod";

export const TASK_DEPENDENCY_TYPES = ["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"] as const;
export type TaskDependencyType = (typeof TASK_DEPENDENCY_TYPES)[number];

export const createTaskDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  type: z.enum(TASK_DEPENDENCY_TYPES).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
});
export type CreateTaskDependencyInput = z.infer<typeof createTaskDependencySchema>;
