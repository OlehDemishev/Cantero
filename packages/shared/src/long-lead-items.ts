import { z } from "zod";

export const LONG_LEAD_ITEM_STATUSES = ["tracking", "ordered", "in_fabrication", "shipped", "delivered"] as const;
export type LongLeadItemStatus = (typeof LONG_LEAD_ITEM_STATUSES)[number];

export const createLongLeadItemSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().min(1).max(300),
  supplierId: z.string().uuid().optional(),
  requiredOnSiteDate: z.string().datetime().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLongLeadItemInput = z.infer<typeof createLongLeadItemSchema>;

export const updateLongLeadItemSchema = z.object({
  description: z.string().min(1).max(300).optional(),
  supplierId: z.string().uuid().nullable().optional(),
  status: z.enum(LONG_LEAD_ITEM_STATUSES).optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  submittalApprovalDate: z.string().datetime().nullable().optional(),
  orderedDate: z.string().datetime().nullable().optional(),
  expectedDeliveryDate: z.string().datetime().nullable().optional(),
  actualDeliveryDate: z.string().datetime().nullable().optional(),
  requiredOnSiteDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateLongLeadItemInput = z.infer<typeof updateLongLeadItemSchema>;
