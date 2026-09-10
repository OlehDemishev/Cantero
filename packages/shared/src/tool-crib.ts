import { z } from "zod";

export const TOOL_CHECKOUT_CONDITIONS = ["good", "damaged", "lost"] as const;
export type ToolCheckoutCondition = (typeof TOOL_CHECKOUT_CONDITIONS)[number];

export const createToolCribItemSchema = z.object({
  name: z.string().min(1).max(160),
  barcode: z.string().max(80).optional(),
  replacementCost: z.number().nonnegative().optional(),
  parLevel: z.number().int().nonnegative().optional(),
  quantityOnHand: z.number().int().nonnegative().optional(),
  /// When true, individual physical units are registered with a serial number (see
  /// registerToolCribUnitsSchema) and checked out/in by unit rather than by bulk quantity.
  serialTracked: z.boolean().default(false),
});
export type CreateToolCribItemInput = z.infer<typeof createToolCribItemSchema>;

export const registerToolCribUnitsSchema = z.object({
  serialNumbers: z.array(z.string().min(1).max(80)).min(1),
});
export type RegisterToolCribUnitsInput = z.infer<typeof registerToolCribUnitsSchema>;

export const checkOutToolSchema = z.object({
  workerId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  /// Required when checking out a serialTracked item — identifies which physical unit goes out
  /// (quantity is then always 1). Ignored for bulk (non-serial-tracked) items.
  unitId: z.string().uuid().optional(),
});
export type CheckOutToolInput = z.infer<typeof checkOutToolSchema>;

export const checkInToolSchema = z.object({
  returnCondition: z.enum(TOOL_CHECKOUT_CONDITIONS),
  chargeAmount: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});
export type CheckInToolInput = z.infer<typeof checkInToolSchema>;
