import { z } from "zod";

export const PERFORMANCE_REVIEW_CYCLE_STATUSES = ["open", "closed"] as const;
export type PerformanceReviewCycleStatus = (typeof PERFORMANCE_REVIEW_CYCLE_STATUSES)[number];

export const PERFORMANCE_RATINGS = ["below_expectations", "meets_expectations", "exceeds_expectations"] as const;
export type PerformanceRating = (typeof PERFORMANCE_RATINGS)[number];

export const createPerformanceReviewCycleSchema = z.object({
  name: z.string().min(1).max(160),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
export type CreatePerformanceReviewCycleInput = z.infer<typeof createPerformanceReviewCycleSchema>;

export const submitPerformanceReviewSchema = z.object({
  workerId: z.string().uuid(),
  rating: z.enum(PERFORMANCE_RATINGS).optional(),
  strengths: z.string().max(4000).optional(),
  improvementAreas: z.string().max(4000).optional(),
  submit: z.boolean().optional(),
});
export type SubmitPerformanceReviewInput = z.infer<typeof submitPerformanceReviewSchema>;

export const createPerformanceGoalSchema = z.object({
  title: z.string().min(1).max(200),
  targetDate: z.string().datetime().optional(),
});
export type CreatePerformanceGoalInput = z.infer<typeof createPerformanceGoalSchema>;

export const updatePerformanceGoalProgressSchema = z.object({
  progressPercent: z.number().int().min(0).max(100),
});
export type UpdatePerformanceGoalProgressInput = z.infer<typeof updatePerformanceGoalProgressSchema>;
