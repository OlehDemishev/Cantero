import { z } from "zod";

export const SUPPLIER_RETURN_STATUSES = ["draft", "sent", "confirmed"] as const;
export type SupplierReturnStatus = (typeof SUPPLIER_RETURN_STATUSES)[number];

export const SUPPLIER_RETURN_REASONS = ["defective", "wrong_item", "overstock", "damaged_in_transit", "other"] as const;
export type SupplierReturnReason = (typeof SUPPLIER_RETURN_REASONS)[number];

export const supplierReturnLineSchema = z.object({
  materialCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type SupplierReturnLineInput = z.infer<typeof supplierReturnLineSchema>;

export const createSupplierReturnSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  reason: z.enum(SUPPLIER_RETURN_REASONS),
  notes: z.string().max(2000).optional(),
  lines: z.array(supplierReturnLineSchema).min(1),
});
export type CreateSupplierReturnInput = z.infer<typeof createSupplierReturnSchema>;
