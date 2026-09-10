import { z } from "zod";

export const STOCK_MOVEMENT_TYPES = ["receipt", "issue", "transfer", "write_off"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** "transfer" is excluded here on purpose — it debits one warehouse and credits
 * another, so it goes through the dedicated transferStockSchema/endpoint instead. */
export const GENERIC_MOVEMENT_TYPES = ["receipt", "issue", "write_off"] as const;

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(300).optional(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const recordStockMovementSchema = z.object({
  warehouseId: z.string().uuid(),
  materialCatalogItemId: z.string().uuid(),
  type: z.enum(GENERIC_MOVEMENT_TYPES),
  quantity: z.number().positive(),
  projectId: z.string().uuid().optional(),
  /// Per-unit cost paid — only meaningful for type=receipt (an issue/write_off's cost is computed
  /// by the costing engine, not entered by hand). Omit to record the movement with no cost data,
  /// same as before this field existed.
  unitCost: z.number().nonnegative().optional(),
  /// Required (enforced in StockService, not here — this schema doesn't know the material's
  /// lotTracked flag) for a receipt against a lot-tracked material: identifies/creates the
  /// StockLot this receipt lands in. Ignored for issue/write_off.
  lotNumber: z.string().min(1).max(120).optional(),
  /// Only meaningful alongside lotNumber on a receipt — shelf-life/expiry date for the new lot.
  expiresAt: z.string().datetime().optional(),
  /// For issue/write_off against a lot-tracked material: consume this specific lot instead of the
  /// default nearest-expiry-first (FEFO) automatic selection across all of the material's lots at
  /// this warehouse.
  lotId: z.string().uuid().optional(),
});
export type RecordStockMovementInput = z.infer<typeof recordStockMovementSchema>;

export const transferStockSchema = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    materialCatalogItemId: z.string().uuid(),
    quantity: z.number().positive(),
    /// For a lot-tracked material: consume this specific source lot instead of the default
    /// nearest-expiry-first (FEFO) automatic selection.
    lotId: z.string().uuid().optional(),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: "fromWarehouseId and toWarehouseId must differ",
    path: ["toWarehouseId"],
  });
export type TransferStockInput = z.infer<typeof transferStockSchema>;

/// The in-transit counterpart to transferStockSchema's instant transfer — see StockTransfer.
export const initiateStockTransferSchema = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    materialCatalogItemId: z.string().uuid(),
    quantity: z.number().positive(),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: "fromWarehouseId and toWarehouseId must differ",
    path: ["toWarehouseId"],
  });
export type InitiateStockTransferInput = z.infer<typeof initiateStockTransferSchema>;

export const issueFromEstimateSchema = z.object({
  estimateId: z.string().uuid(),
  warehouseId: z.string().uuid(),
});
export type IssueFromEstimateInput = z.infer<typeof issueFromEstimateSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const SUPPLIER_DOCUMENT_TYPES = ["general_liability_insurance", "workers_comp_insurance", "other"] as const;
export type SupplierDocumentType = (typeof SUPPLIER_DOCUMENT_TYPES)[number];

export const addSupplierDocumentSchema = z.object({
  type: z.enum(SUPPLIER_DOCUMENT_TYPES),
  name: z.string().min(1).max(160),
  expiresAt: z.string().datetime(),
});
export type AddSupplierDocumentInput = z.infer<typeof addSupplierDocumentSchema>;

export const createSupplierReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  wouldReorder: z.boolean().optional(),
  comments: z.string().max(2000).optional(),
});
export type CreateSupplierReviewInput = z.infer<typeof createSupplierReviewSchema>;

export const purchaseOrderLineSchema = z.object({
  materialCatalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineSchema>;

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  lines: z.array(purchaseOrderLineSchema).min(1),
  expectedDate: z.string().datetime().optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const receivePurchaseOrderSchema = z.object({
  warehouseId: z.string().uuid(),
});
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

export const createStockCountSchema = z.object({
  warehouseId: z.string().uuid(),
});
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

export const updateStockCountLineSchema = z.object({
  countedQuantity: z.number().nonnegative(),
});
export type UpdateStockCountLineInput = z.infer<typeof updateStockCountLineSchema>;

export const vendorBillLineSchema = z.object({
  materialCatalogItemId: z.string().uuid().optional(),
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type VendorBillLineInput = z.infer<typeof vendorBillLineSchema>;

export const createVendorBillSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  billNumber: z.string().min(1).max(80),
  billDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(vendorBillLineSchema).min(1),
});
export type CreateVendorBillInput = z.infer<typeof createVendorBillSchema>;

export const schedulePaymentSchema = z.object({
  scheduledPaymentDate: z.string().datetime(),
});
export type SchedulePaymentInput = z.infer<typeof schedulePaymentSchema>;
