import { z } from "zod";

export const ESTIMATE_ALTERNATE_STATUSES = ["pending", "accepted", "rejected"] as const;
export type EstimateAlternateStatus = (typeof ESTIMATE_ALTERNATE_STATUSES)[number];

export const createEstimateAlternateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** Positive for an add-alt, negative for a deduct-alt. */
  amount: z.number(),
});
export type CreateEstimateAlternateInput = z.infer<typeof createEstimateAlternateSchema>;

export const decideEstimateAlternateSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});
export type DecideEstimateAlternateInput = z.infer<typeof decideEstimateAlternateSchema>;
