import { z } from "zod";

export const requestSupplierPortalLinkSchema = z.object({
  email: z.string().email(),
});
export type RequestSupplierPortalLinkInput = z.infer<typeof requestSupplierPortalLinkSchema>;

export const verifySupplierPortalTokenSchema = z.object({
  token: z.string().min(10),
});
export type VerifySupplierPortalTokenInput = z.infer<typeof verifySupplierPortalTokenSchema>;

export const acknowledgePurchaseOrderSchema = z.object({
  eta: z.string().datetime().optional(),
  note: z.string().max(1000).optional(),
});
export type AcknowledgePurchaseOrderInput = z.infer<typeof acknowledgePurchaseOrderSchema>;
