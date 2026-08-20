import { z } from "zod";

export const SUBMITTAL_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "approved_as_noted",
  "revise_and_resubmit",
  "rejected",
] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export const SUBMITTAL_REVIEW_DECISIONS = ["approved", "approved_as_noted", "revise_and_resubmit", "rejected"] as const;
export type SubmittalReviewDecision = (typeof SUBMITTAL_REVIEW_DECISIONS)[number];

export const createSubmittalSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  specSection: z.string().max(40).optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateSubmittalInput = z.infer<typeof createSubmittalSchema>;

export const updateSubmittalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  specSection: z.string().max(40).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type UpdateSubmittalInput = z.infer<typeof updateSubmittalSchema>;

export const reviewSubmittalSchema = z.object({
  decision: z.enum(SUBMITTAL_REVIEW_DECISIONS),
  comments: z.string().max(2000).optional(),
});
export type ReviewSubmittalInput = z.infer<typeof reviewSubmittalSchema>;
