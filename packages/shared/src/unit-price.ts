import { z } from "zod";

export const createUnitPriceItemSchema = z.object({
  description: z.string().min(1).max(300),
  unit: z.string().min(1).max(20),
  contractUnitPrice: z.number().positive(),
  estimatedQuantity: z.number().positive().optional(),
});
export type CreateUnitPriceItemInput = z.infer<typeof createUnitPriceItemSchema>;

export const addUnitPriceMeasurementSchema = z.object({
  measuredQuantity: z.number().positive(),
  measuredByName: z.string().min(1).max(160),
  notes: z.string().max(500).optional(),
});
export type AddUnitPriceMeasurementInput = z.infer<typeof addUnitPriceMeasurementSchema>;
