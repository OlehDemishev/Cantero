import { z } from "zod";

export const CONTRACT_CLAIM_TYPES = ["delay", "differing_conditions", "scope_dispute", "other"] as const;
export type ContractClaimType = (typeof CONTRACT_CLAIM_TYPES)[number];

export const CONTRACT_CLAIM_STATUSES = ["notice_given", "submitted", "negotiating", "resolved", "rejected"] as const;
export type ContractClaimStatus = (typeof CONTRACT_CLAIM_STATUSES)[number];

export const createContractClaimSchema = z.object({
  type: z.enum(CONTRACT_CLAIM_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  noticeDate: z.string().datetime(),
  requestedAmount: z.number().nonnegative().optional(),
  requestedDays: z.number().int().nonnegative().optional(),
});
export type CreateContractClaimInput = z.infer<typeof createContractClaimSchema>;

export const updateContractClaimStatusSchema = z.object({
  status: z.enum(CONTRACT_CLAIM_STATUSES),
});
export type UpdateContractClaimStatusInput = z.infer<typeof updateContractClaimStatusSchema>;

export const resolveContractClaimSchema = z.object({
  resolution: z.string().min(1).max(4000),
});
export type ResolveContractClaimInput = z.infer<typeof resolveContractClaimSchema>;

export const addContractClaimEventSchema = z.object({
  description: z.string().min(1).max(2000),
  occurredAt: z.string().datetime().optional(),
});
export type AddContractClaimEventInput = z.infer<typeof addContractClaimEventSchema>;
