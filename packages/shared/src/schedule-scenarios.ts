import { z } from "zod";

export const createScheduleScenarioSchema = z.object({
  name: z.string().min(1).max(160),
});
export type CreateScheduleScenarioInput = z.infer<typeof createScheduleScenarioSchema>;

export const setScenarioTaskOverrideSchema = z
  .object({
    taskId: z.string().uuid(),
    startDate: z.string().datetime(),
    dueDate: z.string().datetime(),
  })
  .refine((v) => new Date(v.dueDate).getTime() >= new Date(v.startDate).getTime(), {
    message: "dueDate must be on or after startDate",
    path: ["dueDate"],
  });
export type SetScenarioTaskOverrideInput = z.infer<typeof setScenarioTaskOverrideSchema>;

export const RESOURCE_TYPES = ["worker", "equipment"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const levelResourceSchema = z.object({
  resourceType: z.enum(RESOURCE_TYPES),
  resourceId: z.string().uuid(),
});
export type LevelResourceInput = z.infer<typeof levelResourceSchema>;

export interface LevelingMove {
  assignmentId: string;
  projectName: string;
  originalStartDate: string;
  originalEndDate: string;
  newStartDate: string;
  newEndDate: string;
  shiftedByDays: number;
}
