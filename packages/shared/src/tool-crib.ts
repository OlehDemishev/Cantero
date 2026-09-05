import { z } from "zod";

export const TOOL_CHECKOUT_CONDITIONS = ["good", "damaged", "lost"] as const;
export type ToolCheckoutCondition = (typeof TOOL_CHECKOUT_CONDITIONS)[number];

export const createToolCribItemSchema = z.object({
  name: z.string().min(1).max(160),
  barcode: z.string().max(80).optional(),
  replacementCost: z.number().nonnegative().optional(),
  parLevel: z.number().int().nonnegative().optional(),
  quantityOnHand: z.number().int().nonnegative().optional(),
});
export type CreateToolCribItemInput = z.infer<typeof createToolCribItemSchema>;

export const checkOutToolSchema = z.object({
  workerId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});
export type CheckOutToolInput = z.infer<typeof checkOutToolSchema>;

export const checkInToolSchema = z.object({
  returnCondition: z.enum(TOOL_CHECKOUT_CONDITIONS),
  chargeAmount: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});
export type CheckInToolInput = z.infer<typeof checkInToolSchema>;
