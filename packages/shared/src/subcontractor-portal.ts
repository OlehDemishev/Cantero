import { z } from "zod";

export const requestSubcontractorPortalLinkSchema = z.object({
  email: z.string().email(),
});
export type RequestSubcontractorPortalLinkInput = z.infer<typeof requestSubcontractorPortalLinkSchema>;

export const verifySubcontractorPortalTokenSchema = z.object({
  token: z.string().min(10),
});
export type VerifySubcontractorPortalTokenInput = z.infer<typeof verifySubcontractorPortalTokenSchema>;

export const submitSubcontractorCostSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  incurredDate: z.string().datetime().optional(),
});
export type SubmitSubcontractorCostInput = z.infer<typeof submitSubcontractorCostSchema>;
