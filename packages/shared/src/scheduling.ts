import { z } from "zod";

export const TASK_STATUSES = ["planned", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
  estimateLineId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  isOutdoorWork: z.boolean().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  sortOrder: z.number().int().optional(),
  isOutdoorWork: z.boolean().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const createMilestoneSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
  dueDate: z.string().datetime().optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const createScheduleBaselineSchema = z.object({
  name: z.string().min(1).max(160),
});
export type CreateScheduleBaselineInput = z.infer<typeof createScheduleBaselineSchema>;
