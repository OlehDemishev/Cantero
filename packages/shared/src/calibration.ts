import { z } from "zod";

export const logCalibrationSchema = z
  .object({
    toolCribItemId: z.string().uuid().optional(),
    equipmentId: z.string().uuid().optional(),
    calibratedAt: z.string().datetime(),
    nextDueAt: z.string().datetime(),
    certificateNumber: z.string().max(120).optional(),
    performedBy: z.string().max(160).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => [v.toolCribItemId, v.equipmentId].filter((x) => x !== undefined).length === 1, {
    message: "Exactly one of toolCribItemId or equipmentId is required",
  });
export type LogCalibrationInput = z.infer<typeof logCalibrationSchema>;
