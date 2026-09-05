import { z } from "zod";

export const PREQUALIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type PrequalificationStatus = (typeof PREQUALIFICATION_STATUSES)[number];

export const createPrequalificationSchema = z.object({
  licenseNumber: z.string().max(80).optional(),
  bondingCapacity: z.number().nonnegative().optional(),
  yearsInBusiness: z.number().int().nonnegative().optional(),
  safetyEmrRating: z.number().nonnegative().optional(),
  referencesNotes: z.string().max(2000).optional(),
});
export type CreatePrequalificationInput = z.infer<typeof createPrequalificationSchema>;

export const decidePrequalificationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  score: z.number().int().min(0).max(100).optional(),
  reviewedByName: z.string().min(1).max(160),
  expiresAt: z.string().datetime().optional(),
});
export type DecidePrequalificationInput = z.infer<typeof decidePrequalificationSchema>;
