import { z } from "zod";

export const createResourceAssignmentSchema = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    workerId: z.string().uuid().optional(),
    equipmentId: z.string().uuid().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => [v.workerId, v.equipmentId].filter((x) => x !== undefined).length === 1, {
    message: "Exactly one of workerId or equipmentId is required",
  })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type CreateResourceAssignmentInput = z.infer<typeof createResourceAssignmentSchema>;

export const createCrewSchema = z.object({
  name: z.string().min(1).max(120),
  workerIds: z.array(z.string().uuid()).default([]),
});
export type CreateCrewInput = z.infer<typeof createCrewSchema>;

export const updateCrewMembersSchema = z.object({
  workerIds: z.array(z.string().uuid()),
});
export type UpdateCrewMembersInput = z.infer<typeof updateCrewMembersSchema>;

export const assignCrewSchema = z
  .object({
    crewId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type AssignCrewInput = z.infer<typeof assignCrewSchema>;
