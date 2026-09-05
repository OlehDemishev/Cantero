import { z } from "zod";

export const WARRANTY_COVERAGE_TYPES = ["material", "labor", "both"] as const;
export type WarrantyCoverageType = (typeof WARRANTY_COVERAGE_TYPES)[number];

export const createWarrantyRegistrationSchema = z.object({
  scope: z.string().min(1).max(160),
  manufacturer: z.string().max(160).optional(),
  coverageType: z.enum(WARRANTY_COVERAGE_TYPES).optional(),
  termMonths: z.number().int().positive().max(1200),
  startDate: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});
export type CreateWarrantyRegistrationInput = z.infer<typeof createWarrantyRegistrationSchema>;
