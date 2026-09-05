import { z } from "zod";

export const createConcretePourSchema = z.object({
  location: z.string().min(1).max(160),
  pourDate: z.string().datetime(),
  mixDesign: z.string().max(160).optional(),
  volume: z.number().positive().optional(),
  specifiedStrength: z.number().positive().optional(),
  specifiedSlump: z.number().positive().optional(),
  supplierName: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateConcretePourInput = z.infer<typeof createConcretePourSchema>;

export const addSlumpTestSchema = z.object({
  slumpValue: z.number().nonnegative(),
  withinSpec: z.boolean(),
  testedByName: z.string().min(1).max(160),
  notes: z.string().max(500).optional(),
});
export type AddSlumpTestInput = z.infer<typeof addSlumpTestSchema>;

export const addCylinderBreakSchema = z.object({
  cylinderLabel: z.string().min(1).max(60),
  breakAgeDays: z.number().int().positive(),
  breakDate: z.string().datetime(),
});
export type AddCylinderBreakInput = z.infer<typeof addCylinderBreakSchema>;

export const recordCylinderBreakResultSchema = z.object({
  breakStrength: z.number().positive(),
  testedByName: z.string().min(1).max(160),
  notes: z.string().max(500).optional(),
});
export type RecordCylinderBreakResultInput = z.infer<typeof recordCylinderBreakResultSchema>;

export const CYLINDER_BREAK_RESULTS = ["pass", "fail"] as const;
export type CylinderBreakResult = (typeof CYLINDER_BREAK_RESULTS)[number];
