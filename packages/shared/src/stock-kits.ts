import { z } from "zod";

export const stockKitComponentSchema = z.object({
  materialCatalogItemId: z.string().uuid(),
  quantityPerKit: z.number().positive(),
});
export type StockKitComponentInput = z.infer<typeof stockKitComponentSchema>;

export const createStockKitSchema = z.object({
  kitMaterialCatalogItemId: z.string().uuid(),
  name: z.string().min(1).max(160),
  components: z.array(stockKitComponentSchema).min(1).max(50),
});
export type CreateStockKitInput = z.infer<typeof createStockKitSchema>;

export const updateStockKitSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  components: z.array(stockKitComponentSchema).min(1).max(50).optional(),
});
export type UpdateStockKitInput = z.infer<typeof updateStockKitSchema>;

export const assembleStockKitSchema = z.object({
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type AssembleStockKitInput = z.infer<typeof assembleStockKitSchema>;
