import { z } from "zod";

export const BENEFIT_PLAN_TYPES = ["medical", "dental", "vision", "life", "disability", "other"] as const;
export type BenefitPlanType = (typeof BENEFIT_PLAN_TYPES)[number];

export const BENEFIT_ENROLLMENT_STATUSES = ["active", "waived", "terminated"] as const;
export type BenefitEnrollmentStatus = (typeof BENEFIT_ENROLLMENT_STATUSES)[number];

export const createBenefitPlanSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(BENEFIT_PLAN_TYPES),
  carrier: z.string().max(160).optional(),
});
export type CreateBenefitPlanInput = z.infer<typeof createBenefitPlanSchema>;

export const updateBenefitPlanSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  carrier: z.string().max(160).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateBenefitPlanInput = z.infer<typeof updateBenefitPlanSchema>;

export const createBenefitPlanTierSchema = z.object({
  name: z.string().min(1).max(120),
  monthlyEmployerCost: z.number().nonnegative(),
  monthlyEmployeeCost: z.number().nonnegative(),
});
export type CreateBenefitPlanTierInput = z.infer<typeof createBenefitPlanTierSchema>;

export const enrollWorkerInBenefitSchema = z.object({
  tierId: z.string().uuid(),
  effectiveDate: z.string().datetime(),
  dependents: z
    .array(z.object({ name: z.string().min(1).max(160), relationship: z.string().min(1).max(80), birthDate: z.string().datetime().optional() }))
    .optional(),
});
export type EnrollWorkerInBenefitInput = z.infer<typeof enrollWorkerInBenefitSchema>;

export const updateEnrollmentStatusSchema = z.object({
  status: z.enum(BENEFIT_ENROLLMENT_STATUSES),
});
export type UpdateEnrollmentStatusInput = z.infer<typeof updateEnrollmentStatusSchema>;
