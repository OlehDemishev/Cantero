import { z } from "zod";

export const SURETY_BOND_TYPES = ["bid", "performance", "payment", "maintenance"] as const;
export type SuretyBondType = (typeof SURETY_BOND_TYPES)[number];

export const SURETY_BOND_STATUSES = ["active", "released", "expired"] as const;
export type SuretyBondStatus = (typeof SURETY_BOND_STATUSES)[number];

export const createSuretyBondSchema = z.object({
  projectId: z.string().uuid().optional(),
  type: z.enum(SURETY_BOND_TYPES),
  bondNumber: z.string().max(80).optional(),
  suretyName: z.string().min(1).max(200),
  agentContact: z.string().max(200).optional(),
  penalSum: z.number().positive(),
  premium: z.number().nonnegative().optional(),
  issueDate: z.string().datetime(),
  expiryDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateSuretyBondInput = z.infer<typeof createSuretyBondSchema>;

export const updateSuretyBondCapacityLimitSchema = z.object({
  bondingCapacityLimit: z.number().nonnegative().nullable(),
});
export type UpdateSuretyBondCapacityLimitInput = z.infer<typeof updateSuretyBondCapacityLimitSchema>;
