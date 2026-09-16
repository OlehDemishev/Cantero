import { z } from "zod";

export const STOCK_RESERVATION_STATUSES = ["active", "released"] as const;
export type StockReservationStatus = (typeof STOCK_RESERVATION_STATUSES)[number];

export const createStockReservationSchema = z.object({
  warehouseId: z.string().uuid(),
  materialCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  projectId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});
export type CreateStockReservationInput = z.infer<typeof createStockReservationSchema>;
