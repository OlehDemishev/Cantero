import { z } from "zod";

export const WARRANTY_CLAIM_STATUSES = ["open", "in_progress", "resolved", "denied"] as const;
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];

export const createWarrantyClaimSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
  assigneeWorkerId: z.string().uuid().optional(),
});
export type CreateWarrantyClaimInput = z.infer<typeof createWarrantyClaimSchema>;

export const updateWarrantyClaimSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
  assigneeWorkerId: z.string().uuid().nullable().optional(),
});
export type UpdateWarrantyClaimInput = z.infer<typeof updateWarrantyClaimSchema>;

export const resolveWarrantyClaimSchema = z.object({
  resolutionNotes: z.string().max(2000).optional(),
  repairCost: z.number().nonnegative().optional(),
});
export type ResolveWarrantyClaimInput = z.infer<typeof resolveWarrantyClaimSchema>;

export const denyWarrantyClaimSchema = z.object({
  denialReason: z.string().min(1).max(2000),
});
export type DenyWarrantyClaimInput = z.infer<typeof denyWarrantyClaimSchema>;

/** The portal's own create input omits internal-only fields (assignee) a client has no reason to set. */
export const portalCreateWarrantyClaimSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(160).optional(),
});
export type PortalCreateWarrantyClaimInput = z.infer<typeof portalCreateWarrantyClaimSchema>;
