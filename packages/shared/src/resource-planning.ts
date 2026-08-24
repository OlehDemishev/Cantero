import { z } from "zod";

export const createResourceAssignmentSchema = z
  .object({
    projectId: z.string().uuid(),
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
