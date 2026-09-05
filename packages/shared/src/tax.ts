import { z } from "zod";

export const createTaxJurisdictionSchema = z.object({
  name: z.string().min(1).max(160),
  country: z.string().length(2),
  region: z.string().max(100).optional(),
});
export type CreateTaxJurisdictionInput = z.infer<typeof createTaxJurisdictionSchema>;

export const updateTaxJurisdictionSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  country: z.string().length(2).optional(),
  region: z.string().max(100).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateTaxJurisdictionInput = z.infer<typeof updateTaxJurisdictionSchema>;

export const createTaxRateSchema = z.object({
  ratePercent: z.number().nonnegative().max(100),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional(),
});
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;

export const createTaxExemptionCertificateSchema = z.object({
  certificateNumber: z.string().min(1).max(120),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateTaxExemptionCertificateInput = z.infer<typeof createTaxExemptionCertificateSchema>;

export const setClientTaxJurisdictionSchema = z.object({
  taxJurisdictionId: z.string().uuid().nullable(),
});
export type SetClientTaxJurisdictionInput = z.infer<typeof setClientTaxJurisdictionSchema>;
