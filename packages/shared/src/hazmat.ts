import { z } from "zod";

export const createHazardousMaterialSchema = z.object({
  name: z.string().min(1).max(200),
  manufacturer: z.string().max(160).optional(),
  casNumber: z.string().max(40).optional(),
});
export type CreateHazardousMaterialInput = z.infer<typeof createHazardousMaterialSchema>;

export const addSdsVersionSchema = z.object({
  version: z.string().max(40).optional(),
  revisionDate: z.string().datetime().optional(),
  hazardClassification: z.string().max(200).optional(),
});
export type AddSdsVersionInput = z.infer<typeof addSdsVersionSchema>;

export const addHazmatInventoryItemSchema = z.object({
  hazardousMaterialId: z.string().uuid(),
  quantity: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
});
export type AddHazmatInventoryItemInput = z.infer<typeof addHazmatInventoryItemSchema>;
